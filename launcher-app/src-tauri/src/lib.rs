use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::process::{Command, Stdio};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LauncherSettings {
    #[serde(default = "default_username")]
    username: String,

    #[serde(default = "default_ram_min")]
    ram_min: String,

    #[serde(default = "default_ram_max")]
    ram_max: String,

    #[serde(default = "default_java_path")]
    java_path: String,

    #[serde(default)]
    close_launcher_after_start: bool,
}

fn default_username() -> String {
    "Scorpey".to_string()
}

fn default_ram_min() -> String {
    "2G".to_string()
}

fn default_ram_max() -> String {
    "4G".to_string()
}

fn default_java_path() -> String {
    "java".to_string()
}

impl Default for LauncherSettings {
    fn default() -> Self {
        Self {
            username: default_username(),
            ram_min: default_ram_min(),
            ram_max: default_ram_max(),
            java_path: default_java_path(),
            close_launcher_after_start: false,
        }
    }
}

fn project_root() -> Result<PathBuf, String> {
    let src_tauri_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));

    let launcher_app_dir = src_tauri_dir
        .parent()
        .ok_or("Не удалось найти папку launcher-app")?;

    let root_dir = launcher_app_dir
        .parent()
        .ok_or("Не удалось найти корень проекта")?;

    Ok(root_dir.to_path_buf())
}

fn settings_path() -> Result<PathBuf, String> {
    Ok(project_root()?.join("launcher-data").join("settings.json"))
}

fn save_settings_internal(settings: &LauncherSettings) -> Result<(), String> {
    let path = settings_path()?;

    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("Не удалось создать папку launcher-data: {error}"))?;
    }

    let json = serde_json::to_string_pretty(settings)
        .map_err(|error| format!("Не удалось собрать settings.json: {error}"))?;

    fs::write(&path, json)
        .map_err(|error| format!("Не удалось сохранить settings.json: {error}"))?;

    Ok(())
}

#[tauri::command]
fn read_settings() -> Result<LauncherSettings, String> {
    let path = settings_path()?;

    if !path.exists() {
        let settings = LauncherSettings::default();
        save_settings_internal(&settings)?;
        return Ok(settings);
    }

    let raw = fs::read_to_string(&path)
        .map_err(|error| format!("Не удалось прочитать settings.json: {error}"))?;

    let settings: LauncherSettings = serde_json::from_str(&raw)
        .map_err(|error| format!("Ошибка в settings.json: {error}"))?;

    Ok(settings)
}

#[tauri::command]
fn save_settings(settings: LauncherSettings) -> Result<(), String> {
    save_settings_internal(&settings)
}

#[tauri::command]
fn launch_minecraft(settings: Option<LauncherSettings>, username: Option<String>) -> Result<String, String> {
    let mut final_settings = match settings {
        Some(value) => value,
        None => read_settings()?,
    };

    if let Some(name) = username {
        if !name.trim().is_empty() {
            final_settings.username = name;
        }
    }

    save_settings_internal(&final_settings)?;

    let root = project_root()?;

    let mut command = Command::new("npm.cmd");

    command
        .current_dir(&root)
        .arg("run")
        .arg("launch")
        .arg("mcdonaldsdnepr")
        .arg(&final_settings.username)
        .env("RAM_MIN", &final_settings.ram_min)
        .env("RAM_MAX", &final_settings.ram_max)
        .env("JAVA_PATH", &final_settings.java_path)
        .env("DEBUG_LAUNCH", "0")
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());

    command
        .spawn()
        .map_err(|error| format!("Не удалось запустить Minecraft: {error}"))?;

    Ok(format!("Minecraft запускается для игрока {}", final_settings.username))
}

#[tauri::command]
fn read_launcher_content() -> Result<serde_json::Value, String> {
    let path = project_root()?.join("public").join("launcher-content.json");

    if !path.exists() {
        return Err(format!(
            "Не найден файл контента лаунчера: {}",
            path.display()
        ));
    }

    let raw = fs::read_to_string(&path)
        .map_err(|error| format!("Не удалось прочитать launcher-content.json: {error}"))?;

    let clean = raw.trim_start_matches('\u{feff}');

    let value: serde_json::Value = serde_json::from_str(clean)
        .map_err(|error| format!("Ошибка в launcher-content.json: {error}"))?;

    Ok(value)
}

#[tauri::command]
fn update_instance() -> Result<String, String> {
    let root = project_root()?;

    let output = Command::new("npm.cmd")
        .current_dir(&root)
        .arg("run")
        .arg("update-instance")
        .arg("--")
        .arg("mcdonaldsdnepr")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .map_err(|error| format!("Не удалось запустить проверку файлов: {error}"))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    if !output.status.success() {
        return Err(format!(
            "Проверка файлов завершилась ошибкой.\n{}\n{}",
            stdout, stderr
        ));
    }

    Ok(format!("{}\n{}", stdout, stderr))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            read_settings,
            save_settings,
            launch_minecraft,
            update_instance,
            read_launcher_content
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}