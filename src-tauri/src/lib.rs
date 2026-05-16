use std::net::TcpListener;
use std::sync::Mutex;
use serde_json::Value;

/// Holds the bound listener across two Tauri commands.
struct OAuthListener(Mutex<Option<TcpListener>>);

/// Step 1 — bind the first available port in 7329..7339 and stash the listener.
/// Returns the port so the frontend can build the correct redirect URI.
#[tauri::command]
fn prepare_oauth_listener(state: tauri::State<'_, OAuthListener>) -> Result<u16, String> {
    for port in 7329u16..7340 {
        match TcpListener::bind(format!("127.0.0.1:{port}")) {
            Ok(listener) => {
                *state.0.lock().unwrap() = Some(listener);
                return Ok(port);
            }
            Err(_) => continue,
        }
    }
    Err("All ports 7329–7339 are in use. Close any other apps that may be using them.".to_string())
}

/// Step 2 — wait until Square redirects to localhost and return the auth code.
#[tauri::command]
async fn wait_for_oauth_code(state: tauri::State<'_, OAuthListener>) -> Result<String, String> {
    let listener = state.0.lock().unwrap().take()
        .ok_or("No listener — call prepare_oauth_listener first")?;

    tokio::task::spawn_blocking(move || {
        use std::io::{Read, Write};

        let (mut stream, _) = listener.accept()
            .map_err(|e| format!("Accept failed: {e}"))?;

        let mut buf = vec![0u8; 8192];
        let n = stream.read(&mut buf).map_err(|e| format!("Read failed: {e}"))?;
        let raw = String::from_utf8_lossy(&buf[..n]);

        let first_line = raw.lines().next().unwrap_or("");
        let path = first_line.split_whitespace().nth(1).unwrap_or("");

        let code = path
            .split('?')
            .nth(1)
            .and_then(|qs| {
                qs.split('&')
                    .find(|p| p.starts_with("code="))
                    .map(|p| url_decode(&p["code=".len()..]))
            })
            .ok_or_else(|| {
                let error_param = path.split('?').nth(1).and_then(|qs| {
                    qs.split('&')
                        .find(|p| p.starts_with("error="))
                        .map(|p| url_decode(&p["error=".len()..]))
                });
                format!(
                    "No authorization code in callback URL{}",
                    error_param.map(|e| format!(" (Square error: {e})")).unwrap_or_default()
                )
            })?;

        let html = "<html><body style=\"font-family:system-ui;text-align:center;padding:60px\">\
            <h2>Connected to Walley\u{2019}s Analytics!</h2>\
            <p>You can close this window and return to the app.</p>\
            </body></html>";
        let response = format!(
            "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
            html.len(), html
        );
        let _ = stream.write_all(response.as_bytes());

        Ok(code)
    })
    .await
    .map_err(|e| format!("Thread join error: {e}"))?
}

/// Exchange an authorization code for tokens.
/// Goes through Rust/reqwest to bypass CORS (Square's token endpoint is server-to-server only).
#[tauri::command]
async fn exchange_square_code(
    code: String,
    app_id: String,
    app_secret: String,
    redirect_uri: String,
) -> Result<Value, String> {
    let client = reqwest::Client::new();
    let body = serde_json::json!({
        "client_id":     app_id,
        "client_secret": app_secret,
        "code":          code,
        "redirect_uri":  redirect_uri,
        "grant_type":    "authorization_code",
    });

    let res = client
        .post("https://connect.squareup.com/oauth2/token")
        .header("Content-Type", "application/json")
        .header("Square-Version", "2023-10-18")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Request failed: {e}"))?;

    let data: Value = res.json().await
        .map_err(|e| format!("Failed to parse response: {e}"))?;

    Ok(data)
}

/// Refresh an existing access token.
/// Goes through Rust/reqwest to bypass CORS (same server-to-server restriction as token exchange).
#[tauri::command]
async fn refresh_square_token(
    app_id: String,
    app_secret: String,
    refresh_token: String,
) -> Result<Value, String> {
    let client = reqwest::Client::new();
    let body = serde_json::json!({
        "client_id":     app_id,
        "client_secret": app_secret,
        "grant_type":    "refresh_token",
        "refresh_token": refresh_token,
    });

    let res = client
        .post("https://connect.squareup.com/oauth2/token")
        .header("Content-Type", "application/json")
        .header("Square-Version", "2023-10-18")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Request failed: {e}"))?;

    let data: Value = res.json().await
        .map_err(|e| format!("Failed to parse response: {e}"))?;

    Ok(data)
}

/// Generic proxy for Square API calls.
/// Routes all Square API traffic through Rust/reqwest for reliability and to avoid
/// any webview CORS edge cases.
#[tauri::command]
async fn proxy_square_api(
    access_token: String,
    method: String,
    url: String,
    body: Option<String>,
) -> Result<String, String> {
    let client = reqwest::Client::new();

    let mut req = match method.to_uppercase().as_str() {
        "POST" => client.post(&url),
        "PUT"  => client.put(&url),
        "DELETE" => client.delete(&url),
        _ => client.get(&url),
    };

    req = req
        .header("Authorization", format!("Bearer {access_token}"))
        .header("Content-Type", "application/json")
        .header("Square-Version", "2023-10-18");

    if let Some(b) = body {
        req = req.body(b);
    }

    let res = req.send().await.map_err(|e| format!("Request failed: {e}"))?;
    let status = res.status().as_u16();
    let text = res.text().await.map_err(|e| format!("Read body failed: {e}"))?;

    if status >= 400 {
        return Err(format!("Square API error {status}: {text}"));
    }

    Ok(text)
}

fn url_decode(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let bytes = s.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let Ok(hex) = std::str::from_utf8(&bytes[i+1..i+3]) {
                if let Ok(b) = u8::from_str_radix(hex, 16) {
                    out.push(b as char);
                    i += 3;
                    continue;
                }
            }
        }
        out.push(if bytes[i] == b'+' { ' ' } else { bytes[i] as char });
        i += 1;
    }
    out
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(OAuthListener(Mutex::new(None)))
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            prepare_oauth_listener,
            wait_for_oauth_code,
            exchange_square_code,
            refresh_square_token,
            proxy_square_api,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application")
}
