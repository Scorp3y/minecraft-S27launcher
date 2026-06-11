use std::path::PathBuf;
use std::process::Command;

fn get_project_root() -> Result<PathBuf, String> {
    let src_tauri_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));

    let launcher_app_dir = src_tauri_dir
        .parent()
        .ok_or("Не удалось найти папку launcher-app")?;

    let project_root = launcher_app_dir
        .parent()
        .ok_or("Не удалось найти корень проекта")?;

    Ok(project_root.to_path_buf())
}

#[tauri::command]
fn update_profile() -> Result<String, String> {
    let project_root = get_project_root()?;

    let output = Command::new("npm.cmd")
        .args(["run", "update-profile", "mcdonaldsdnepr"])
        .current_dir(&project_root)
        .output()
        .map_err(|error| format!("Не удалось запустить обновление: {}", error))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    if output.status.success() {
        Ok(stdout)
    } else {
        Err(format!("Ошибка обновления:\n{}\n{}", stdout, stderr))
    }
}

#[tauri::command]
fn launch_minecraft(username: String) -> Result<String, String> {
    let project_root = get_project_root()?;

    Command::new("npm.cmd")
        .args(["run", "launch", "mcdonaldsdnepr", &username])
        .current_dir(&project_root)
        .spawn()
        .map_err(|error| format!("Не удалось запустить Minecraft: {}", error))?;

    Ok(format!("Minecraft запускается для игрока {}", username))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            update_profile,
            launch_minecraft
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}