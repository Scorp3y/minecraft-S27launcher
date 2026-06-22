use serde::{Deserialize, Serialize};
use tauri::Emitter;
use sha2::{Digest, Sha256};
use std::collections::HashSet;
use std::fs::{self, File};
use std::io::{self, Read, Write};
use std::net::{TcpStream, ToSocketAddrs};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

const PROFILE_ID: &str = "mcdonaldsdnepr";
const REMOTE_MANIFEST_URL: &str =
    "https://drive.google.com/uc?export=download&id=1JYXV9i10CxFTeS0wpXxCefVvW-wpaxJe";

const SERVER_NAME: &str = "SECTOR 27 | McDonalds Dnepr";
const SERVER_HOST: &str = "yarik_anime_studio.exaroton.me";
const SERVER_PORT: &str = "46919";

const MC_VERSION: &str = "1.19.2";
const FORGE_VERSION: &str = "43.4.12";
const MCP_VERSION: &str = "20220805.130853";

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

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct RuntimeInfo {
    root: String,
    launcher_data: String,
    settings_file: String,
    logs: String,
    log_file: String,
    instances: String,
    active_instance: String,
    cache: String,
    downloads_cache: String,
    manifests_cache: String,
    icons_cache: String,
    temp: String,
    backups: String,
    runtime: String,
    runtime_file: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct LaunchProgressEvent {
    step: String,
    label: String,
    message: String,
    percent: u8,
    status: String,
}

#[derive(Debug, Clone, Deserialize)]
struct VersionJson {
    #[serde(rename = "mainClass")]
    main_class: Option<String>,

    libraries: Option<Vec<Library>>,
}

#[derive(Debug, Clone, Deserialize)]
struct Library {
    name: Option<String>,
    downloads: Option<LibraryDownloads>,
    artifact: Option<LibraryArtifact>,
}

#[derive(Debug, Clone, Deserialize)]
struct LibraryDownloads {
    artifact: Option<LibraryArtifact>,
}

#[derive(Debug, Clone, Deserialize)]
struct LibraryArtifact {
    path: Option<String>,
}

#[allow(dead_code)]
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Profile {
    id: String,
    name: String,
    description: String,
    minecraft_version: String,
    loader: String,
    loader_version: String,
    server_ip: String,
    manifest_url: String,
    banner_url: Option<String>,
    status: Option<String>,
}

#[allow(dead_code)]
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProfilesConfig {
    launcher_name: String,
    version: String,
    profiles: Vec<Profile>,
}

#[allow(dead_code)]
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ManifestFile {
    path: String,
    url: String,
    sha256: String,
    size: u64,
}

#[allow(dead_code)]
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ManifestPack {
    #[serde(rename = "type")]
    pack_type: String,
    url: String,
    sha256: String,
    size: u64,
}

#[allow(dead_code)]
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Manifest {
    id: String,
    name: String,
    version: String,
    minecraft_version: String,
    loader: String,
    loader_version: String,

    #[serde(default)]
    pack: Option<ManifestPack>,

    #[serde(default)]
    files: Vec<ManifestFile>,

    #[serde(default)]
    delete: Vec<String>,

    #[serde(default)]
    clean: Vec<String>,
}

fn default_username() -> String {
    "Scorpy".to_string()
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

fn custom_version() -> String {
    format!("{MC_VERSION}-forge-{FORGE_VERSION}")
}

fn server_address() -> String {
    format!("{SERVER_HOST}:{SERVER_PORT}")
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

fn app_data_root() -> Result<PathBuf, String> {
    let appdata = std::env::var("APPDATA")
        .map_err(|_| "Не удалось найти переменную окружения APPDATA".to_string())?;

    Ok(PathBuf::from(appdata).join("SECTOR 27 Launcher"))
}

fn launcher_data_dir() -> Result<PathBuf, String> {
    Ok(app_data_root()?.join("launcher-data"))
}

fn settings_path() -> Result<PathBuf, String> {
    Ok(launcher_data_dir()?.join("settings.json"))
}

fn logs_dir() -> Result<PathBuf, String> {
    Ok(app_data_root()?.join("logs"))
}

fn launcher_log_path() -> Result<PathBuf, String> {
    Ok(logs_dir()?.join("launcher.log"))
}

fn app_instances_dir() -> Result<PathBuf, String> {
    Ok(app_data_root()?.join("instances"))
}

fn app_instance_dir(profile_id: &str) -> Result<PathBuf, String> {
    Ok(app_instances_dir()?.join(profile_id))
}

fn project_instance_dir(profile_id: &str) -> Result<PathBuf, String> {
    Ok(project_root()?.join("instances").join(profile_id))
}

fn cache_dir() -> Result<PathBuf, String> {
    Ok(app_data_root()?.join("cache"))
}

fn downloads_cache_dir() -> Result<PathBuf, String> {
    Ok(cache_dir()?.join("downloads"))
}

fn manifests_cache_dir() -> Result<PathBuf, String> {
    Ok(cache_dir()?.join("manifests"))
}

fn icons_cache_dir() -> Result<PathBuf, String> {
    Ok(cache_dir()?.join("icons"))
}

fn temp_dir() -> Result<PathBuf, String> {
    Ok(app_data_root()?.join("temp"))
}

fn backups_dir() -> Result<PathBuf, String> {
    Ok(app_data_root()?.join("backups"))
}

fn runtime_dir() -> Result<PathBuf, String> {
    Ok(app_data_root()?.join("runtime"))
}

fn runtime_file_path() -> Result<PathBuf, String> {
    Ok(runtime_dir()?.join("runtime.json"))
}

fn path_to_string(path: &Path) -> String {
    path.to_string_lossy().to_string()
}

fn emit_progress(
    app: Option<&tauri::AppHandle>,
    step: &str,
    label: &str,
    message: &str,
    percent: u8,
    status: &str,
) {
    if let Some(app) = app {
        let payload = LaunchProgressEvent {
            step: step.to_string(),
            label: label.to_string(),
            message: message.to_string(),
            percent: percent.min(100),
            status: status.to_string(),
        };

        let _ = app.emit("launch-progress", payload);
    }
}

fn open_in_file_manager(path: &Path) -> Result<(), String> {
    if !path.exists() {
        return Err(format!("Путь не найден: {}", path.display()));
    }

    #[cfg(target_os = "windows")]
    {
        Command::new("explorer")
            .arg(path)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .map(|_| ())
            .map_err(|error| format!("Не удалось открыть проводник: {error}"))
    }

    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(path)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .map(|_| ())
            .map_err(|error| format!("Не удалось открыть Finder: {error}"))
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        Command::new("xdg-open")
            .arg(path)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .map(|_| ())
            .map_err(|error| format!("Не удалось открыть файловый менеджер: {error}"))
    }
}

fn read_json_file<T>(path: &Path) -> Result<T, String>
where
    T: for<'de> Deserialize<'de>,
{
    let raw = fs::read_to_string(path)
        .map_err(|error| format!("Не удалось прочитать JSON {}: {error}", path.display()))?;

    let clean = raw.trim_start_matches('\u{feff}');

    serde_json::from_str(clean)
        .map_err(|error| format!("Ошибка JSON {}: {error}", path.display()))
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

fn copy_dir_recursive(source: &Path, destination: &Path) -> Result<(), String> {
    if !source.exists() {
        return Err(format!("Источник не найден: {}", source.display()));
    }

    fs::create_dir_all(destination)
        .map_err(|error| format!("Не удалось создать папку {}: {error}", destination.display()))?;

    for entry in fs::read_dir(source)
        .map_err(|error| format!("Не удалось прочитать папку {}: {error}", source.display()))?
    {
        let entry = entry.map_err(|error| format!("Ошибка чтения элемента папки: {error}"))?;
        let source_path = entry.path();
        let destination_path = destination.join(entry.file_name());

        if source_path.is_dir() {
            copy_dir_recursive(&source_path, &destination_path)?;
        } else {
            if let Some(parent) = destination_path.parent() {
                fs::create_dir_all(parent)
                    .map_err(|error| format!("Не удалось создать папку {}: {error}", parent.display()))?;
            }

            fs::copy(&source_path, &destination_path).map_err(|error| {
                format!(
                    "Не удалось скопировать файл {} -> {}: {error}",
                    source_path.display(),
                    destination_path.display()
                )
            })?;
        }
    }

    Ok(())
}

fn download_file_with_progress(
    url: &str,
    target_path: &Path,
    expected_size: u64,
    app: Option<&tauri::AppHandle>,
    step: &str,
    label: &str,
    message: &str,
    percent_from: u8,
    percent_to: u8,
) -> Result<(), String> {
    if let Some(parent) = target_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("Не удалось создать папку {}: {error}", parent.display()))?;
    }

    emit_progress(
        app,
        step,
        label,
        message,
        percent_from,
        "active",
    );

    let response = ureq::get(url)
        .set("User-Agent", "SECTOR27-Launcher/1.0")
        .call()
        .map_err(|error| format!("Не удалось скачать файл:\n{url}\nОшибка: {error}"))?;

    let mut reader = response.into_reader();
    let mut output = File::create(target_path)
        .map_err(|error| format!("Не удалось создать файл {}: {error}", target_path.display()))?;

    let mut downloaded = 0u64;
    let mut buffer = [0u8; 64 * 1024];

    loop {
        let bytes_read = reader
            .read(&mut buffer)
            .map_err(|error| format!("Ошибка чтения загрузки: {error}"))?;

        if bytes_read == 0 {
            break;
        }

        output
            .write_all(&buffer[..bytes_read])
            .map_err(|error| format!("Ошибка записи файла {}: {error}", target_path.display()))?;

        downloaded += bytes_read as u64;

        if expected_size > 0 && percent_to > percent_from {
            let progress_range = percent_to - percent_from;
            let local_percent = ((downloaded as f64 / expected_size as f64)
                * progress_range as f64)
                .round() as u8;

            let percent = percent_from
                .saturating_add(local_percent)
                .min(percent_to);

            emit_progress(
                app,
                step,
                label,
                &format!("Скачано {} / {} байт", downloaded, expected_size),
                percent,
                "active",
            );
        }
    }

    emit_progress(
        app,
        step,
        label,
        "Загрузка завершена",
        percent_to,
        "done",
    );

    Ok(())
}

fn download_json_from_url<T>(
    url: &str,
    cache_path: &Path,
    app: Option<&tauri::AppHandle>,
) -> Result<T, String>
where
    T: for<'de> Deserialize<'de>,
{
    download_file_with_progress(
        url,
        cache_path,
        0,
        app,
        "manifest",
        "Проверка manifest",
        "Скачивание remote manifest",
        12,
        18,
    )?;

    read_json_file(cache_path)
}

fn extract_zip_to_dir(
    zip_path: &Path,
    destination_dir: &Path,
    app: Option<&tauri::AppHandle>,
) -> Result<(), String> {
    if destination_dir.exists() {
        fs::remove_dir_all(destination_dir)
            .map_err(|error| format!("Не удалось очистить temp {}: {error}", destination_dir.display()))?;
    }

    fs::create_dir_all(destination_dir)
        .map_err(|error| format!("Не удалось создать temp {}: {error}", destination_dir.display()))?;

    emit_progress(
        app,
        "resourcepacks",
        "Распаковка сборки",
        "Открытие zip-архива",
        58,
        "active",
    );

    let zip_file = File::open(zip_path)
        .map_err(|error| format!("Не удалось открыть zip {}: {error}", zip_path.display()))?;

    let mut archive = zip::ZipArchive::new(zip_file)
        .map_err(|error| format!("Не удалось прочитать zip {}: {error}", zip_path.display()))?;

    let total = archive.len().max(1);

    for index in 0..archive.len() {
        let mut entry = archive
            .by_index(index)
            .map_err(|error| format!("Ошибка чтения файла в zip #{index}: {error}"))?;

        let Some(enclosed_name) = entry.enclosed_name().map(|path| path.to_owned()) else {
            continue;
        };

        let output_path = destination_dir.join(enclosed_name);

        let percent = 58 + (((index + 1) as f32 / total as f32) * 12.0).round() as u8;

        emit_progress(
            app,
            "resourcepacks",
            "Распаковка сборки",
            &format!("{}/{} · {}", index + 1, total, entry.name()),
            percent.min(70),
            "active",
        );

        if entry.is_dir() {
            fs::create_dir_all(&output_path)
                .map_err(|error| format!("Не удалось создать папку {}: {error}", output_path.display()))?;
        } else {
            if let Some(parent) = output_path.parent() {
                fs::create_dir_all(parent)
                    .map_err(|error| format!("Не удалось создать папку {}: {error}", parent.display()))?;
            }

            let mut output_file = File::create(&output_path)
                .map_err(|error| format!("Не удалось создать файл {}: {error}", output_path.display()))?;

            io::copy(&mut entry, &mut output_file)
                .map_err(|error| format!("Не удалось распаковать {}: {error}", output_path.display()))?;
        }
    }

    emit_progress(
        app,
        "resourcepacks",
        "Распаковка сборки",
        "Zip распакован",
        70,
        "done",
    );

    Ok(())
}

fn clean_dirs_from_manifest(manifest: &Manifest) -> Vec<String> {
    if manifest.clean.is_empty() {
        return vec![
            "mods".to_string(),
            "config".to_string(),
            "resourcepacks".to_string(),
        ];
    }

    manifest.clean.clone()
}

fn resolve_extracted_pack_root(extracted_dir: &Path) -> Result<PathBuf, String> {
    if extracted_dir.join("mods").exists()
        || extracted_dir.join("config").exists()
        || extracted_dir.join("resourcepacks").exists()
    {
        return Ok(extracted_dir.to_path_buf());
    }

    for entry in fs::read_dir(extracted_dir)
        .map_err(|error| format!("Не удалось прочитать temp {}: {error}", extracted_dir.display()))?
    {
        let entry = entry.map_err(|error| format!("Ошибка чтения temp: {error}"))?;
        let path = entry.path();

        if !path.is_dir() {
            continue;
        }

        if path.join("mods").exists()
            || path.join("config").exists()
            || path.join("resourcepacks").exists()
        {
            return Ok(path);
        }
    }

    Ok(extracted_dir.to_path_buf())
}

fn sync_extracted_pack_to_instance(
    extracted_dir: &Path,
    instance_dir: &Path,
    manifest: &Manifest,
    logs: &mut Vec<String>,
    app: Option<&tauri::AppHandle>,
) -> Result<u32, String> {
    let pack_root = resolve_extracted_pack_root(extracted_dir)?;

    logs.push(format!("Папка распакованной сборки: {}", pack_root.display()));

    let clean_dirs = clean_dirs_from_manifest(manifest);
    let mut synced = 0u32;

    for dir_name in clean_dirs {
        let stage = manifest_stage(&format!("{dir_name}/"));
        let label = stage_label(stage);

        emit_progress(
            app,
            stage,
            label,
            &format!("Синхронизация {dir_name}"),
            72,
            "active",
        );

        let source_dir = pack_root.join(&dir_name);
        let target_dir = safe_join(instance_dir, &dir_name)?;

        if target_dir.exists() {
            fs::remove_dir_all(&target_dir)
                .map_err(|error| format!("Не удалось очистить {}: {error}", target_dir.display()))?;
        }

        if source_dir.exists() {
            copy_dir_recursive(&source_dir, &target_dir)?;
            logs.push(format!("Синхронизирована папка: {dir_name}"));
            synced += 1;
        } else {
            fs::create_dir_all(&target_dir)
                .map_err(|error| format!("Не удалось создать {}: {error}", target_dir.display()))?;
            logs.push(format!("Папка отсутствует в архиве, создана пустая: {dir_name}"));
        }
    }

    emit_progress(
        app,
        "resourcepacks",
        "Синхронизация сборки",
        "Файлы сборки обновлены",
        76,
        "done",
    );

    Ok(synced)
}

fn extract_query_param(url: &str, key: &str) -> Option<String> {
    let query = url.split('?').nth(1)?;

    for part in query.split('&') {
        let mut pieces = part.splitn(2, '=');
        let name = pieces.next()?;
        let value = pieces.next().unwrap_or("");

        if name == key && !value.is_empty() {
            return Some(value.to_string());
        }
    }

    None
}

fn extract_google_drive_file_id(url: &str) -> Option<String> {
    if let Some(id) = extract_query_param(url, "id") {
        return Some(id);
    }

    let marker = "/file/d/";
    let after_marker = url.split(marker).nth(1)?;
    let id = after_marker.split('/').next()?.trim();

    if id.is_empty() {
        None
    } else {
        Some(id.to_string())
    }
}

fn normalize_download_url(url: &str) -> String {
    if url.contains("drive.google.com") || url.contains("drive.usercontent.google.com") {
        if let Some(file_id) = extract_google_drive_file_id(url) {
            return format!(
                "https://drive.usercontent.google.com/download?id={file_id}&export=download&confirm=t"
            );
        }
    }

    url.to_string()
}

fn update_by_zip_manifest(
    manifest: &Manifest,
    pack: &ManifestPack,
    logs: &mut Vec<String>,
    app: Option<&tauri::AppHandle>,
) -> Result<(), String> {
    if pack.pack_type.to_lowercase() != "zip" {
        return Err(format!("Неподдерживаемый тип pack: {}", pack.pack_type));
    }

    let instance_dir = app_instance_dir(&manifest.id)?;

    fs::create_dir_all(&instance_dir)
        .map_err(|error| format!("Не удалось создать instance {}: {error}", instance_dir.display()))?;

    logs.push(format!("Remote updater: {}", manifest.name));
    logs.push(format!("Версия сборки: {}", manifest.version));
    logs.push(format!("Manifest URL: {REMOTE_MANIFEST_URL}"));
    logs.push(format!("Pack URL: {}", pack.url));
    logs.push(format!("Pack size: {}", pack.size));
    logs.push(format!("Pack sha256: {}", pack.sha256));
    logs.push(format!("Папка игрока: {}", instance_dir.display()));

    let safe_version = manifest
        .version
        .replace('/', "_")
        .replace('\\', "_")
        .replace(':', "_");

let zip_path = downloads_cache_dir()?.join(format!("{}-{safe_version}.zip", manifest.id));

let pack_download_url = normalize_download_url(&pack.url);

logs.push(format!("Resolved pack URL: {pack_download_url}"));

download_file_with_progress(
    &pack_download_url,
    &zip_path,
    pack.size,
    app,
    "manifest",
    "Скачивание сборки",
    "Загрузка pack.zip из Google Drive",
    20,
    52,
)?;

    emit_progress(
        app,
        "manifest",
        "Проверка sha256",
        "Проверка целостности zip",
        54,
        "active",
    );

    let actual_hash = sha256_file(&zip_path)?;

    if actual_hash.to_lowercase() != pack.sha256.to_lowercase() {
        let _ = fs::remove_file(&zip_path);

        return Err(format!(
            "SHA256 zip не совпал.\nОжидалось: {}\nПолучено: {}\nВозможно Google Drive вернул HTML-страницу вместо файла или файл был изменён.",
            pack.sha256,
            actual_hash
        ));
    }

    logs.push("SHA256 zip совпал".to_string());

    emit_progress(
        app,
        "manifest",
        "Проверка sha256",
        "Zip проверен",
        56,
        "done",
    );

    let extracted_dir = temp_dir()?.join(format!("{}-{safe_version}", manifest.id));

    extract_zip_to_dir(&zip_path, &extracted_dir, app)?;

    let synced = sync_extracted_pack_to_instance(
        &extracted_dir,
        &instance_dir,
        manifest,
        logs,
        app,
    )?;

    let mut deleted = 0u32;

    for file_to_delete in &manifest.delete {
        if delete_file_from_instance(&instance_dir, file_to_delete)? {
            deleted += 1;
            logs.push(format!("Удалён: {file_to_delete}"));
        }
    }

    logs.push("Remote update готов.".to_string());
    logs.push(format!("Синхронизировано папок: {synced}"));
    logs.push(format!("Удалено файлов: {deleted}"));

    emit_progress(
        app,
        "resourcepacks",
        "Проверка файлов завершена",
        &format!("Синхронизировано папок: {synced}"),
        78,
        "done",
    );

    Ok(())
}

fn clean_pack_dirs(instance_dir: &Path) -> Result<(), String> {
    let pack_dirs = ["mods", "config", "resourcepacks"];

    for dir_name in pack_dirs {
        let dir = instance_dir.join(dir_name);

        if dir.exists() {
            fs::remove_dir_all(&dir)
                .map_err(|error| format!("Не удалось очистить {}: {error}", dir.display()))?;
        }
    }

    Ok(())
}

fn sync_instance_to_appdata(profile_id: &str, clean_pack_folders: bool) -> Result<PathBuf, String> {
    let source = project_instance_dir(profile_id)?;
    let destination = app_instance_dir(profile_id)?;

    if !source.exists() {
        return Err(format!(
            "Проектная instance не найдена: {}",
            source.display()
        ));
    }

    if clean_pack_folders && destination.exists() {
        clean_pack_dirs(&destination)?;
    }

    copy_dir_recursive(&source, &destination)?;

    Ok(destination)
}

fn ensure_instance_exists_in_appdata(profile_id: &str) -> Result<PathBuf, String> {
    let destination = app_instance_dir(profile_id)?;

    fs::create_dir_all(&destination)
        .map_err(|error| format!("Не удалось создать instance {}: {error}", destination.display()))?;

    Ok(destination)
}

fn library_name_to_path(name: &str) -> Result<PathBuf, String> {
    let parts: Vec<&str> = name.split(':').collect();

    if parts.len() < 3 {
        return Err(format!("Некорректное имя библиотеки: {name}"));
    }

    let group = parts[0];
    let artifact = parts[1];
    let version = parts[2];

    if group.is_empty() || artifact.is_empty() || version.is_empty() {
        return Err(format!("Некорректное имя библиотеки: {name}"));
    }

    let group_path = group.replace('.', "/");
    let file_name = format!("{artifact}-{version}.jar");

    Ok(PathBuf::from(group_path)
        .join(artifact)
        .join(version)
        .join(file_name))
}

fn get_library_relative_path(library: &Library) -> Result<Option<PathBuf>, String> {
    if let Some(path) = library
        .downloads
        .as_ref()
        .and_then(|downloads| downloads.artifact.as_ref())
        .and_then(|artifact| artifact.path.as_ref())
    {
        return Ok(Some(PathBuf::from(path)));
    }

    if let Some(path) = library
        .artifact
        .as_ref()
        .and_then(|artifact| artifact.path.as_ref())
    {
        return Ok(Some(PathBuf::from(path)));
    }

    if let Some(name) = library.name.as_ref() {
        return Ok(Some(library_name_to_path(name)?));
    }

    Ok(None)
}

fn should_skip_library(relative_path: &Path) -> bool {
    let normalized = relative_path.to_string_lossy().replace('\\', "/");

    normalized.contains("natives-windows-x86")
        || normalized.contains("natives-windows-arm64")
        || normalized.contains("natives-linux")
        || normalized.contains("natives-macos")
        || normalized.contains("natives-osx")
}

fn add_unique_path(paths: &mut Vec<PathBuf>, seen: &mut HashSet<String>, path: PathBuf) {
    let key = path.to_string_lossy().to_string();

    if seen.insert(key) {
        paths.push(path);
    }
}

fn collect_classpath(instance_dir: &Path) -> Result<String, String> {
    let libraries_dir = instance_dir.join("libraries");
    let version = custom_version();

    let vanilla_json_path = instance_dir
        .join("versions")
        .join(MC_VERSION)
        .join(format!("{MC_VERSION}.json"));

    let forge_json_path = instance_dir
        .join("versions")
        .join(&version)
        .join(format!("{version}.json"));

    let forge_jar_path = instance_dir
        .join("versions")
        .join(&version)
        .join(format!("{version}.jar"));

    let vanilla_json: VersionJson = read_json_file(&vanilla_json_path)?;
    let forge_json: VersionJson = read_json_file(&forge_json_path)?;

    let mut classpath: Vec<PathBuf> = Vec::new();
    let mut seen: HashSet<String> = HashSet::new();

    let mut libraries: Vec<Library> = Vec::new();
    libraries.extend(vanilla_json.libraries.unwrap_or_default());
    libraries.extend(forge_json.libraries.unwrap_or_default());

    for library in libraries {
        let Some(relative_path) = get_library_relative_path(&library)? else {
            continue;
        };

        if should_skip_library(&relative_path) {
            continue;
        }

        let full_path = libraries_dir.join(relative_path);

        if full_path.exists() {
            add_unique_path(&mut classpath, &mut seen, full_path);
        }
    }

    if !forge_jar_path.exists() {
        return Err(format!("Не найден jar версии: {}", forge_jar_path.display()));
    }

    add_unique_path(&mut classpath, &mut seen, forge_jar_path);

    let joined = classpath
        .iter()
        .map(|path| path.to_string_lossy().to_string())
        .collect::<Vec<String>>()
        .join(";");

    Ok(joined)
}

fn forge_module_path(instance_dir: &Path) -> String {
    let libraries_dir = instance_dir.join("libraries");

    let modules = [
        "cpw/mods/bootstraplauncher/1.1.2/bootstraplauncher-1.1.2.jar",
        "cpw/mods/securejarhandler/2.1.4/securejarhandler-2.1.4.jar",
        "org/ow2/asm/asm-commons/9.7.1/asm-commons-9.7.1.jar",
        "org/ow2/asm/asm-util/9.7.1/asm-util-9.7.1.jar",
        "org/ow2/asm/asm-analysis/9.7.1/asm-analysis-9.7.1.jar",
        "org/ow2/asm/asm-tree/9.7.1/asm-tree-9.7.1.jar",
        "org/ow2/asm/asm/9.7.1/asm-9.7.1.jar",
        "net/minecraftforge/JarJarFileSystems/0.3.16/JarJarFileSystems-0.3.16.jar",
    ];

    modules
        .iter()
        .map(|relative_path| libraries_dir.join(relative_path).to_string_lossy().to_string())
        .collect::<Vec<String>>()
        .join(";")
}

fn write_short(value: u16) -> Vec<u8> {
    value.to_be_bytes().to_vec()
}

fn write_int(value: i32) -> Vec<u8> {
    value.to_be_bytes().to_vec()
}

fn write_string_value(value: &str) -> Vec<u8> {
    let data = value.as_bytes();

    let mut result = Vec::new();
    result.extend(write_short(data.len() as u16));
    result.extend(data);

    result
}

fn write_named_tag_header(tag_type: u8, name: &str) -> Vec<u8> {
    let mut result = Vec::new();
    result.push(tag_type);
    result.extend(write_string_value(name));

    result
}

fn write_string_tag(name: &str, value: &str) -> Vec<u8> {
    let mut result = Vec::new();
    result.extend(write_named_tag_header(8, name));
    result.extend(write_string_value(value));

    result
}

fn write_byte_tag(name: &str, value: u8) -> Vec<u8> {
    let mut result = Vec::new();
    result.extend(write_named_tag_header(1, name));
    result.push(value);

    result
}

fn create_servers_dat(server_name: &str, server_address: &str) -> Vec<u8> {
    let mut server_compound = Vec::new();
    server_compound.extend(write_string_tag("name", server_name));
    server_compound.extend(write_string_tag("ip", server_address));
    server_compound.extend(write_byte_tag("hidden", 0));
    server_compound.extend(write_byte_tag("acceptTextures", 0));
    server_compound.push(0);

    let mut servers_list = Vec::new();
    servers_list.extend(write_named_tag_header(9, "servers"));
    servers_list.push(10);
    servers_list.extend(write_int(1));
    servers_list.extend(server_compound);

    let mut root_compound = Vec::new();
    root_compound.push(10);
    root_compound.extend(write_string_value(""));
    root_compound.extend(servers_list);
    root_compound.push(0);

    root_compound
}

fn write_servers_dat(instance_dir: &Path) -> Result<(), String> {
    let servers_dat_path = instance_dir.join("servers.dat");
    let data = create_servers_dat(SERVER_NAME, &server_address());

    fs::write(&servers_dat_path, data)
        .map_err(|error| format!("Не удалось записать servers.dat: {error}"))?;

    Ok(())
}

fn make_offline_uuid() -> String {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or(0);

    let pid = std::process::id() as u128;
    let value = nanos ^ (pid << 64);

    format!("{value:032x}")
}

fn write_var_int(value: i32) -> Vec<u8> {
    let mut value = value as u32;
    let mut bytes = Vec::new();

    loop {
        let mut temp = (value & 0b0111_1111) as u8;
        value >>= 7;

        if value != 0 {
            temp |= 0b1000_0000;
        }

        bytes.push(temp);

        if value == 0 {
            break;
        }
    }

    bytes
}

fn read_var_int_from_stream(stream: &mut TcpStream) -> Result<i32, String> {
    let mut value = 0i32;
    let mut position = 0;

    loop {
        let mut byte = [0u8; 1];

        stream
            .read_exact(&mut byte)
            .map_err(|error| format!("Не удалось прочитать VarInt: {error}"))?;

        let current = byte[0] as i32;
        value |= (current & 0b0111_1111) << position;

        if (current & 0b1000_0000) == 0 {
            break;
        }

        position += 7;

        if position >= 35 {
            return Err("VarInt слишком большой".to_string());
        }
    }

    Ok(value)
}

fn read_var_int_from_buffer(buffer: &[u8], offset: &mut usize) -> Result<i32, String> {
    let mut value = 0i32;
    let mut position = 0;

    loop {
        if *offset >= buffer.len() {
            return Err("Недостаточно данных для чтения VarInt".to_string());
        }

        let current = buffer[*offset] as i32;
        *offset += 1;

        value |= (current & 0b0111_1111) << position;

        if (current & 0b1000_0000) == 0 {
            break;
        }

        position += 7;

        if position >= 35 {
            return Err("VarInt слишком большой".to_string());
        }
    }

    Ok(value)
}

fn write_mc_string(value: &str) -> Vec<u8> {
    let data = value.as_bytes();

    let mut result = Vec::new();
    result.extend(write_var_int(data.len() as i32));
    result.extend(data);

    result
}

fn create_mc_packet(payload: Vec<u8>) -> Vec<u8> {
    let mut result = Vec::new();

    result.extend(write_var_int(payload.len() as i32));
    result.extend(payload);

    result
}

fn create_status_handshake_packet(host: &str, port: u16, protocol_version: i32) -> Vec<u8> {
    let mut payload = Vec::new();

    payload.extend(write_var_int(0));
    payload.extend(write_var_int(protocol_version));
    payload.extend(write_mc_string(host));
    payload.extend(port.to_be_bytes());
    payload.extend(write_var_int(1));

    create_mc_packet(payload)
}

fn create_status_request_packet() -> Vec<u8> {
    create_mc_packet(write_var_int(0))
}

fn connect_to_server(host: &str, port: u16, timeout: Duration) -> Result<TcpStream, String> {
    let addresses = (host, port)
        .to_socket_addrs()
        .map_err(|error| format!("Не удалось получить адрес сервера: {error}"))?
        .collect::<Vec<_>>();

    if addresses.is_empty() {
        return Err("DNS не вернул адрес сервера".to_string());
    }

    let mut last_error = None;

    for address in addresses {
        match TcpStream::connect_timeout(&address, timeout) {
            Ok(stream) => return Ok(stream),
            Err(error) => last_error = Some(error.to_string()),
        }
    }

    Err(format!(
        "Не удалось подключиться к серверу: {}",
        last_error.unwrap_or_else(|| "unknown error".to_string())
    ))
}

fn read_status_json(stream: &mut TcpStream) -> Result<String, String> {
    let packet_length = read_var_int_from_stream(stream)?;

    if packet_length <= 0 {
        return Err(format!("Некорректная длина пакета: {packet_length}"));
    }

    let mut packet = vec![0u8; packet_length as usize];

    stream
        .read_exact(&mut packet)
        .map_err(|error| format!("Не удалось прочитать пакет статуса: {error}"))?;

    let mut offset = 0usize;

    let packet_id = read_var_int_from_buffer(&packet, &mut offset)?;

    if packet_id != 0 {
        return Err(format!("Неожиданный packet id статуса: {packet_id}"));
    }

    let json_length = read_var_int_from_buffer(&packet, &mut offset)?;

    if json_length < 0 {
        return Err(format!("Некорректная длина JSON: {json_length}"));
    }

    let json_end = offset + json_length as usize;

    if json_end > packet.len() {
        return Err("Ответ сервера получен не полностью".to_string());
    }

    let json_raw = String::from_utf8(packet[offset..json_end].to_vec())
        .map_err(|error| format!("Ответ сервера не UTF-8: {error}"))?;

    Ok(json_raw)
}

fn strip_minecraft_colors(value: &str) -> String {
    let mut result = String::new();
    let mut skip_next = false;

    for character in value.chars() {
        if skip_next {
            skip_next = false;
            continue;
        }

        if character == '§' {
            skip_next = true;
            continue;
        }

        result.push(character);
    }

    result
}

fn parse_motd(value: &serde_json::Value) -> String {
    if value.is_null() {
        return String::new();
    }

    if let Some(text) = value.as_str() {
        return strip_minecraft_colors(text);
    }

    if let Some(object) = value.as_object() {
        let mut result = String::new();

        if let Some(text) = object.get("text").and_then(|value| value.as_str()) {
            result.push_str(text);
        }

        if let Some(extra) = object.get("extra").and_then(|value| value.as_array()) {
            for item in extra {
                result.push_str(&parse_motd(item));
            }
        }

        return strip_minecraft_colors(&result);
    }

    String::new()
}

fn offline_server_status(error: &str) -> serde_json::Value {
    serde_json::json!({
        "state": "offline",
        "online": false,
        "sleeping": false,
        "host": SERVER_HOST,
        "port": SERVER_PORT.parse::<u16>().unwrap_or(46919),
        "playersOnline": 0,
        "maxPlayers": 0,
        "pingMs": null,
        "version": "Unknown",
        "description": "",
        "error": error
    })
}

fn ping_minecraft_server(protocol_version: i32) -> Result<serde_json::Value, String> {
    let port = SERVER_PORT.parse::<u16>().unwrap_or(46919);
    let timeout = Duration::from_secs(5);
    let started_at = Instant::now();

    let mut stream = connect_to_server(SERVER_HOST, port, timeout)?;

    stream
        .set_read_timeout(Some(timeout))
        .map_err(|error| format!("Не удалось поставить read timeout: {error}"))?;

    stream
        .set_write_timeout(Some(timeout))
        .map_err(|error| format!("Не удалось поставить write timeout: {error}"))?;

    let handshake = create_status_handshake_packet(SERVER_HOST, port, protocol_version);
    let request = create_status_request_packet();

    stream
        .write_all(&handshake)
        .map_err(|error| format!("Не удалось отправить handshake: {error}"))?;

    stream
        .write_all(&request)
        .map_err(|error| format!("Не удалось отправить status request: {error}"))?;

    let json_raw = read_status_json(&mut stream)?;

    let data: serde_json::Value = serde_json::from_str(&json_raw)
        .map_err(|error| format!("Сервер вернул некорректный JSON: {error}\n{json_raw}"))?;

    let players_online = data
        .get("players")
        .and_then(|players| players.get("online"))
        .and_then(|value| value.as_u64())
        .unwrap_or(0);

    let max_players = data
        .get("players")
        .and_then(|players| players.get("max"))
        .and_then(|value| value.as_u64())
        .unwrap_or(0);

    let version = data
        .get("version")
        .and_then(|version| version.get("name"))
        .and_then(|value| value.as_str())
        .map(strip_minecraft_colors)
        .unwrap_or_else(|| "Unknown".to_string());

    let description = data
        .get("description")
        .map(parse_motd)
        .unwrap_or_default();

    let is_sleeping =
        version.to_lowercase().contains("sleeping")
            || description.to_lowercase().contains("sleeping");

    let ping_ms = started_at.elapsed().as_millis() as u64;

    Ok(serde_json::json!({
        "state": if is_sleeping { "sleeping" } else { "online" },
        "online": !is_sleeping,
        "sleeping": is_sleeping,
        "host": SERVER_HOST,
        "port": port,
        "playersOnline": players_online,
        "maxPlayers": max_players,
        "pingMs": ping_ms,
        "version": version,
        "description": description
    }))
}

fn source_to_local_public_path(source: &str) -> Result<PathBuf, String> {
    let source = source.replace('\\', "/");

    if Path::new(&source).is_absolute() {
        return Ok(PathBuf::from(source));
    }

    let clean_source = if source.starts_with("http://") || source.starts_with("https://") {
        let Some(after_scheme) = source.split("://").nth(1) else {
            return Err(format!("Некорректный URL: {source}"));
        };

        let Some(path_start) = after_scheme.find('/') else {
            return Err(format!("В URL нет пути к файлу: {source}"));
        };

        after_scheme[path_start..].trim_start_matches('/').to_string()
    } else {
        source.trim_start_matches('/').to_string()
    };

    if clean_source.starts_with("public/") {
        Ok(project_root()?.join(clean_source))
    } else {
        Ok(project_root()?.join("public").join(clean_source))
    }
}

fn load_json_from_source<T>(source: &str) -> Result<T, String>
where
    T: for<'de> Deserialize<'de>,
{
    let path = source_to_local_public_path(source)?;

    if !path.exists() {
        return Err(format!(
            "Локальный JSON не найден: {}\nИсточник: {}",
            path.display(),
            source
        ));
    }

    read_json_file(&path)
}

fn read_profiles_config() -> Result<ProfilesConfig, String> {
    load_json_from_source("public/profiles.json")
}

fn sha256_file(path: &Path) -> Result<String, String> {
    let bytes = fs::read(path)
        .map_err(|error| format!("Не удалось прочитать файл для SHA256 {}: {error}", path.display()))?;

    let mut hasher = Sha256::new();
    hasher.update(&bytes);

    Ok(hex::encode(hasher.finalize()))
}

fn safe_join(base: &Path, relative_path: &str) -> Result<PathBuf, String> {
    let normalized = relative_path.replace('\\', "/");

    if normalized.starts_with('/') || normalized.split('/').any(|part| part == "..") {
        return Err(format!("Опасный путь в manifest: {relative_path}"));
    }

    Ok(base.join(normalized))
}

fn copy_file_from_source(source: &str, target_path: &Path) -> Result<(), String> {
    let source_path = source_to_local_public_path(source)?;

    if !source_path.exists() {
        return Err(format!(
            "Файл источника не найден: {}\nИсточник из manifest: {}",
            source_path.display(),
            source
        ));
    }

    if let Some(parent) = target_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("Не удалось создать папку {}: {error}", parent.display()))?;
    }

    fs::copy(&source_path, target_path)
        .map(|_| ())
        .map_err(|error| {
            format!(
                "Не удалось скопировать файл {} -> {}: {error}",
                source_path.display(),
                target_path.display()
            )
        })
}

fn delete_file_from_instance(instance_dir: &Path, relative_path: &str) -> Result<bool, String> {
    let target_path = safe_join(instance_dir, relative_path)?;

    if target_path.exists() {
        fs::remove_file(&target_path)
            .map_err(|error| format!("Не удалось удалить {}: {error}", target_path.display()))?;

        return Ok(true);
    }

    Ok(false)
}

fn get_all_files(dir: &Path) -> Result<Vec<PathBuf>, String> {
    if !dir.exists() {
        return Ok(Vec::new());
    }

    let mut result = Vec::new();

    for entry in fs::read_dir(dir)
        .map_err(|error| format!("Не удалось прочитать папку {}: {error}", dir.display()))?
    {
        let entry = entry.map_err(|error| format!("Ошибка чтения элемента папки: {error}"))?;
        let path = entry.path();

        if path.is_dir() {
            result.extend(get_all_files(&path)?);
        } else {
            result.push(path);
        }
    }

    Ok(result)
}

fn to_manifest_style_path(base_dir: &Path, full_path: &Path) -> Result<String, String> {
    let relative = full_path
        .strip_prefix(base_dir)
        .map_err(|error| format!("Не удалось получить относительный путь: {error}"))?;

    Ok(relative.to_string_lossy().replace('\\', "/"))
}

fn clean_extra_files(
    instance_dir: &Path,
    manifest: &Manifest,
    logs: &mut Vec<String>,
) -> Result<u32, String> {
    let allowed_files = manifest
        .files
        .iter()
        .map(|file| file.path.clone())
        .collect::<HashSet<String>>();

    let mut removed = 0u32;

    for clean_dir in &manifest.clean {
        let target_clean_dir = safe_join(instance_dir, clean_dir)?;

        let local_files = get_all_files(&target_clean_dir)?;

        for local_file in local_files {
            let relative_path = to_manifest_style_path(instance_dir, &local_file)?;

            if !allowed_files.contains(&relative_path) {
                fs::remove_file(&local_file).map_err(|error| {
                    format!("Не удалось удалить лишний файл {}: {error}", local_file.display())
                })?;

                removed += 1;
                logs.push(format!("Удалён лишний файл: {relative_path}"));
            }
        }
    }

    Ok(removed)
}

fn manifest_stage(path: &str) -> &'static str {
    let normalized = path.replace('\\', "/");

    if normalized.starts_with("mods/") {
        "mods"
    } else if normalized.starts_with("config/") {
        "config"
    } else if normalized.starts_with("resourcepacks/") {
        "resourcepacks"
    } else {
        "manifest"
    }
}

fn stage_label(stage: &str) -> &'static str {
    match stage {
        "mods" => "Синхронизация mods",
        "config" => "Синхронизация config",
        "resourcepacks" => "Синхронизация resourcepacks",
        _ => "Проверка manifest",
    }
}

fn process_manifest_file(
    instance_dir: &Path,
    file: &ManifestFile,
    logs: &mut Vec<String>,
    downloaded: &mut u32,
    skipped: &mut u32,
    failed: &mut u32,
) -> Result<(), String> {
    let target_path = safe_join(instance_dir, &file.path)?;

    let mut needs_update = false;

    if !target_path.exists() {
        needs_update = true;
        logs.push(format!("Нет файла: {}", file.path));
    } else {
        let current_hash = sha256_file(&target_path)?;

        if current_hash != file.sha256 {
            needs_update = true;
            logs.push(format!("Файл устарел или изменён: {}", file.path));
        }
    }

    if !needs_update {
        *skipped += 1;
        logs.push(format!("ОК: {}", file.path));
        return Ok(());
    }

    logs.push(format!("Копирую: {}", file.url));

    match copy_file_from_source(&file.url, &target_path) {
        Ok(()) => {
            let new_hash = sha256_file(&target_path)?;

            if new_hash != file.sha256 {
                let _ = fs::remove_file(&target_path);
                *failed += 1;
                logs.push(format!("Ошибка файла: {}", file.path));
                logs.push("Хэш не совпал после копирования".to_string());
                return Ok(());
            }

            *downloaded += 1;
            logs.push(format!("Обновлён: {}", file.path));
        }
        Err(error) => {
            *failed += 1;
            logs.push(format!("Ошибка файла: {}", file.path));
            logs.push(error);
        }
    }

    Ok(())
}

fn sync_manifest_stage(
    app: Option<&tauri::AppHandle>,
    instance_dir: &Path,
    manifest: &Manifest,
    stage: &str,
    percent_from: u8,
    percent_to: u8,
    logs: &mut Vec<String>,
    downloaded: &mut u32,
    skipped: &mut u32,
    failed: &mut u32,
) -> Result<(), String> {
    let label = stage_label(stage);
    let stage_files = manifest
        .files
        .iter()
        .filter(|file| manifest_stage(&file.path) == stage)
        .collect::<Vec<&ManifestFile>>();

    if stage_files.is_empty() {
        emit_progress(
            app,
            stage,
            label,
            "Файлов для этого этапа нет",
            percent_to,
            "done",
        );

        logs.push(format!("{label}: файлов нет"));
        return Ok(());
    }

    emit_progress(
        app,
        stage,
        label,
        &format!("Файлов: {}", stage_files.len()),
        percent_from,
        "active",
    );

    let total = stage_files.len().max(1) as f32;

    for (index, file) in stage_files.iter().enumerate() {
        let local_percent = percent_from as f32
            + (((index + 1) as f32 / total) * (percent_to.saturating_sub(percent_from) as f32));

        emit_progress(
            app,
            stage,
            label,
            &format!("{}/{} · {}", index + 1, stage_files.len(), file.path),
            local_percent.round() as u8,
            "active",
        );

        process_manifest_file(instance_dir, file, logs, downloaded, skipped, failed)?;
    }

    emit_progress(
        app,
        stage,
        label,
        "Этап завершён",
        percent_to,
        "done",
    );

    Ok(())
}

fn update_by_manifest(
    manifest: &Manifest,
    logs: &mut Vec<String>,
    app: Option<&tauri::AppHandle>,
) -> Result<(), String> {
        if let Some(pack) = manifest.pack.as_ref() {
        return update_by_zip_manifest(manifest, pack, logs, app);
    }

    let instance_dir = app_instance_dir(&manifest.id)?;

    fs::create_dir_all(&instance_dir)
        .map_err(|error| format!("Не удалось создать instance {}: {error}", instance_dir.display()))?;

    logs.push(format!("Обновление сборки: {}", manifest.name));
    logs.push(format!("ID сборки: {}", manifest.id));
    logs.push(format!("Версия сборки: {}", manifest.version));
    logs.push(format!("Minecraft: {}", manifest.minecraft_version));
    logs.push(format!("Loader: {} {}", manifest.loader, manifest.loader_version));
    logs.push(format!("Папка игрока: {}", instance_dir.display()));

    let mut downloaded = 0u32;
    let mut skipped = 0u32;
    let mut deleted = 0u32;
    let mut failed = 0u32;

    sync_manifest_stage(
        app,
        &instance_dir,
        manifest,
        "manifest",
        18,
        30,
        logs,
        &mut downloaded,
        &mut skipped,
        &mut failed,
    )?;

    sync_manifest_stage(
        app,
        &instance_dir,
        manifest,
        "mods",
        31,
        48,
        logs,
        &mut downloaded,
        &mut skipped,
        &mut failed,
    )?;

    sync_manifest_stage(
        app,
        &instance_dir,
        manifest,
        "config",
        49,
        62,
        logs,
        &mut downloaded,
        &mut skipped,
        &mut failed,
    )?;

    sync_manifest_stage(
        app,
        &instance_dir,
        manifest,
        "resourcepacks",
        63,
        74,
        logs,
        &mut downloaded,
        &mut skipped,
        &mut failed,
    )?;

    emit_progress(
        app,
        "resourcepacks",
        "Очистка лишних файлов",
        "Удаление файлов, которых нет в manifest",
        75,
        "active",
    );

    for file_to_delete in &manifest.delete {
        if delete_file_from_instance(&instance_dir, file_to_delete)? {
            deleted += 1;
            logs.push(format!("Удалён: {file_to_delete}"));
        }
    }

    deleted += clean_extra_files(&instance_dir, manifest, logs)?;

    logs.push("Готово.".to_string());
    logs.push(format!("Скопировано/обновлено: {downloaded}"));
    logs.push(format!("Уже актуальных: {skipped}"));
    logs.push(format!("Удалено: {deleted}"));
    logs.push(format!("Ошибок: {failed}"));

    emit_progress(
        app,
        "resourcepacks",
        "Проверка файлов завершена",
        &format!("Обновлено: {downloaded} · актуальных: {skipped} · ошибок: {failed}"),
        76,
        if failed > 0 { "error" } else { "done" },
    );

    if failed > 0 {
        return Err(logs.join("\n"));
    }

    Ok(())
}

fn update_profile_direct(profile_id: &str, app: Option<&tauri::AppHandle>) -> Result<String, String> {
    let mut logs = Vec::new();

    ensure_instance_exists_in_appdata(profile_id)?;

    logs.push("Remote updater включён".to_string());
    logs.push(format!("Manifest URL: {REMOTE_MANIFEST_URL}"));

    emit_progress(
        app,
        "manifest",
        "Проверка manifest",
        "Скачивание remote manifest",
        12,
        "active",
    );

    let manifest_cache_path = manifests_cache_dir()?.join("remote-manifest.json");

    let manifest: Manifest = download_json_from_url(
        REMOTE_MANIFEST_URL,
        &manifest_cache_path,
        app,
    )?;

    if manifest.id != profile_id {
        return Err(format!(
            "Manifest относится к другому профилю.\nОжидалось: {profile_id}\nПолучено: {}",
            manifest.id
        ));
    }

    logs.push(format!("Выбран профиль: {}", manifest.name));
    logs.push(format!("Версия сборки: {}", manifest.version));
    logs.push(format!("Minecraft: {}", manifest.minecraft_version));
    logs.push(format!("Loader: {} {}", manifest.loader, manifest.loader_version));

    update_by_manifest(&manifest, &mut logs, app)?;

    Ok(logs.join("\n"))
}

fn build_java_args(
    settings: &LauncherSettings,
    instance_dir: &Path,
    username: &str,
) -> Result<Vec<String>, String> {
    let version = custom_version();

    let assets_dir = instance_dir.join("assets");
    let libraries_dir = instance_dir.join("libraries");

    let forge_json_path = instance_dir
        .join("versions")
        .join(&version)
        .join(format!("{version}.json"));

    let forge_json: VersionJson = read_json_file(&forge_json_path)?;

    let main_class = forge_json
        .main_class
        .unwrap_or_else(|| "cpw.mods.bootstraplauncher.BootstrapLauncher".to_string());

    let classpath = collect_classpath(instance_dir)?;
    let uuid = make_offline_uuid();

    let custom_jar_name = format!("{version}.jar");
    let ignore_list = vec![
        "bootstraplauncher",
        "securejarhandler",
        "asm-commons",
        "asm-util",
        "asm-analysis",
        "asm-tree",
        "asm",
        "JarJarFileSystems",
        "client-extra",
        "fmlcore",
        "javafmllanguage",
        "lowcodelanguage",
        "mclanguage",
        "forge-",
        custom_jar_name.as_str(),
    ]
    .join(",");

    let args = vec![
        "-XX:-UseAdaptiveSizePolicy".to_string(),
        "-XX:-OmitStackTraceInFastThrow".to_string(),
        "-Dfml.ignorePatchDiscrepancies=true".to_string(),
        "-Dfml.ignoreInvalidMinecraftCertificates=true".to_string(),
        format!("-Djava.library.path={}", instance_dir.to_string_lossy()),
        format!("-Xmx{}", settings.ram_max),
        format!("-Xms{}", settings.ram_min),
        "-Djava.net.preferIPv6Addresses=system".to_string(),
        format!("-DignoreList={ignore_list}"),
        "-DmergeModules=jna-5.12.1.jar,jna-platform-5.12.1.jar".to_string(),
        format!("-DlibraryDirectory={}", libraries_dir.to_string_lossy()),
        "-p".to_string(),
        forge_module_path(instance_dir),
        "--add-modules".to_string(),
        "ALL-MODULE-PATH".to_string(),
        "--add-opens".to_string(),
        "java.base/java.util.jar=cpw.mods.securejarhandler".to_string(),
        "--add-opens".to_string(),
        "java.base/java.lang.invoke=cpw.mods.securejarhandler".to_string(),
        "--add-exports".to_string(),
        "java.base/sun.security.util=cpw.mods.securejarhandler".to_string(),
        "--add-exports".to_string(),
        "jdk.naming.dns/com.sun.jndi.dns=java.naming".to_string(),
        "-cp".to_string(),
        classpath,
        main_class,
        "--launchTarget".to_string(),
        "forgeclient".to_string(),
        "--fml.forgeVersion".to_string(),
        FORGE_VERSION.to_string(),
        "--fml.mcVersion".to_string(),
        MC_VERSION.to_string(),
        "--fml.forgeGroup".to_string(),
        "net.minecraftforge".to_string(),
        "--fml.mcpVersion".to_string(),
        MCP_VERSION.to_string(),
        "--username".to_string(),
        username.to_string(),
        "--version".to_string(),
        version,
        "--gameDir".to_string(),
        instance_dir.to_string_lossy().to_string(),
        "--assetsDir".to_string(),
        assets_dir.to_string_lossy().to_string(),
        "--assetIndex".to_string(),
        "legacy".to_string(),
        "--uuid".to_string(),
        uuid.clone(),
        "--accessToken".to_string(),
        uuid.clone(),
        "--clientId".to_string(),
        uuid.clone(),
        "--xuid".to_string(),
        uuid,
        "--userType".to_string(),
        "mojang".to_string(),
        "--versionType".to_string(),
        "release".to_string(),
    ];

    Ok(args)
}

#[tauri::command]
fn prepare_runtime() -> Result<RuntimeInfo, String> {
    let root = app_data_root()?;
    let launcher_data = launcher_data_dir()?;
    let settings_file = settings_path()?;
    let logs = logs_dir()?;
    let log_file = launcher_log_path()?;
    let instances = app_instances_dir()?;
    let active_instance = app_instance_dir(PROFILE_ID)?;
    let cache = cache_dir()?;
    let downloads_cache = downloads_cache_dir()?;
    let manifests_cache = manifests_cache_dir()?;
    let icons_cache = icons_cache_dir()?;
    let temp = temp_dir()?;
    let backups = backups_dir()?;
    let runtime = runtime_dir()?;
    let runtime_file = runtime_file_path()?;

    let dirs = [
        &root,
        &launcher_data,
        &logs,
        &instances,
        &cache,
        &downloads_cache,
        &manifests_cache,
        &icons_cache,
        &temp,
        &backups,
        &runtime,
    ];

    for dir in dirs {
        fs::create_dir_all(dir)
            .map_err(|error| format!("Не удалось создать папку {}: {error}", dir.display()))?;
    }

    let info = RuntimeInfo {
        root: path_to_string(&root),
        launcher_data: path_to_string(&launcher_data),
        settings_file: path_to_string(&settings_file),
        logs: path_to_string(&logs),
        log_file: path_to_string(&log_file),
        instances: path_to_string(&instances),
        active_instance: path_to_string(&active_instance),
        cache: path_to_string(&cache),
        downloads_cache: path_to_string(&downloads_cache),
        manifests_cache: path_to_string(&manifests_cache),
        icons_cache: path_to_string(&icons_cache),
        temp: path_to_string(&temp),
        backups: path_to_string(&backups),
        runtime: path_to_string(&runtime),
        runtime_file: path_to_string(&runtime_file),
    };

    let json = serde_json::to_string_pretty(&info)
        .map_err(|error| format!("Не удалось собрать runtime.json: {error}"))?;

    fs::write(&runtime_file, json)
        .map_err(|error| format!("Не удалось записать runtime.json: {error}"))?;

    Ok(info)
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

    let clean = raw.trim_start_matches('\u{feff}');

    if clean.trim().is_empty() {
        let settings = LauncherSettings::default();
        save_settings_internal(&settings)?;
        return Ok(settings);
    }

    let settings: LauncherSettings = serde_json::from_str(clean)
        .map_err(|error| format!("Ошибка в settings.json: {error}"))?;

    Ok(settings)
}

#[tauri::command]
fn save_settings(settings: LauncherSettings) -> Result<(), String> {
    save_settings_internal(&settings)
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

fn update_instance_blocking(app: Option<tauri::AppHandle>) -> Result<String, String> {
    emit_progress(
        app.as_ref(),
        "prepare",
        "Подготовка лаунчера",
        "Создание runtime-папок",
        4,
        "active",
    );

    prepare_runtime()?;

    emit_progress(
        app.as_ref(),
        "prepare",
        "Подготовка лаунчера",
        "Runtime готов",
        10,
        "done",
    );

    update_profile_direct(PROFILE_ID, app.as_ref())
}

fn launch_minecraft_blocking(
    app: Option<tauri::AppHandle>,
    settings: Option<LauncherSettings>,
    username: Option<String>,
) -> Result<String, String> {
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

    let instance_dir = ensure_instance_exists_in_appdata(PROFILE_ID)?;

    if !instance_dir.exists() {
        return Err(format!(
            "Instance не найдена в AppData: {}",
            instance_dir.display()
        ));
    }

    emit_progress(
        app.as_ref(),
        "servers",
        "Создание servers.dat",
        &format!("Добавление сервера {SERVER_NAME}"),
        80,
        "active",
    );

    write_servers_dat(&instance_dir)?;

    emit_progress(
        app.as_ref(),
        "servers",
        "Создание servers.dat",
        "Сервер добавлен в Multiplayer",
        84,
        "done",
    );

    emit_progress(
        app.as_ref(),
        "launch",
        "Запуск Minecraft",
        "Сбор Java-аргументов Forge",
        88,
        "active",
    );

    let args = build_java_args(&final_settings, &instance_dir, &final_settings.username)?;

    Command::new(&final_settings.java_path)
        .current_dir(&instance_dir)
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|error| format!("Не удалось запустить Java напрямую: {error}"))?;

    emit_progress(
        app.as_ref(),
        "launch",
        "Запуск Minecraft",
        "Процесс Java запущен",
        96,
        "done",
    );

    emit_progress(
        app.as_ref(),
        "done",
        "Готово",
        "Minecraft запускается",
        100,
        "done",
    );

    Ok(format!(
        "Minecraft запускается напрямую через Java для игрока {}",
        final_settings.username
    ))
}

fn repair_instance_blocking(app: Option<tauri::AppHandle>) -> Result<String, String> {
    let mut logs = Vec::new();

    emit_progress(
        app.as_ref(),
        "prepare",
        "Подготовка лаунчера",
        "Подготовка runtime перед ремонтом",
        4,
        "active",
    );

    prepare_runtime()?;

    let instance_dir = ensure_instance_exists_in_appdata(PROFILE_ID)?;

    logs.push(format!("Ремонт сборки: {PROFILE_ID}"));
    logs.push(format!("Папка сборки: {}", instance_dir.display()));
    logs.push("Очистка mods, config и resourcepacks".to_string());

    clean_pack_dirs(&instance_dir)?;

    emit_progress(
        app.as_ref(),
        "prepare",
        "Подготовка лаунчера",
        "Папки сборки очищены",
        10,
        "done",
    );

    let update_log = update_profile_direct(PROFILE_ID, app.as_ref())?;
    logs.push(update_log);

    emit_progress(
        app.as_ref(),
        "servers",
        "Создание servers.dat",
        "Восстановление списка серверов",
        80,
        "active",
    );

    write_servers_dat(&instance_dir)?;

    emit_progress(
        app.as_ref(),
        "servers",
        "Создание servers.dat",
        "servers.dat восстановлен",
        90,
        "done",
    );

    emit_progress(
        app.as_ref(),
        "done",
        "Готово",
        "Сборка починена",
        100,
        "done",
    );

    logs.push("Ремонт завершён.".to_string());

    Ok(logs.join("\n"))
}

fn get_server_status_blocking() -> Result<serde_json::Value, String> {
    match ping_minecraft_server(760) {
        Ok(status) => Ok(status),
        Err(first_error) => match ping_minecraft_server(-1) {
            Ok(status) => Ok(status),
            Err(second_error) => Ok(offline_server_status(&format!(
                "{first_error}; fallback: {second_error}"
            ))),
        },
    }
}

#[tauri::command]
fn open_game_folder() -> Result<(), String> {
    prepare_runtime()?;

    let dir = app_instance_dir(PROFILE_ID)?;

    fs::create_dir_all(&dir)
        .map_err(|error| format!("Не удалось создать папку игры {}: {error}", dir.display()))?;

    open_in_file_manager(&dir)
}

#[tauri::command]
fn open_logs_folder() -> Result<(), String> {
    prepare_runtime()?;

    let dir = logs_dir()?;

    fs::create_dir_all(&dir)
        .map_err(|error| format!("Не удалось создать папку логов {}: {error}", dir.display()))?;

    open_in_file_manager(&dir)
}

#[tauri::command]
async fn update_instance(app: tauri::AppHandle) -> Result<String, String> {
    let app_for_error = app.clone();

    let result = tauri::async_runtime::spawn_blocking(move || update_instance_blocking(Some(app)))
        .await
        .map_err(|error| format!("Фоновая задача обновления сорвалась: {error}"))?;

    if let Err(error) = result.as_ref() {
        emit_progress(
            Some(&app_for_error),
            "manifest",
            "Проверка manifest",
            error,
            20,
            "error",
        );
    }

    result
}

#[tauri::command]
async fn launch_minecraft(
    app: tauri::AppHandle,
    settings: Option<LauncherSettings>,
    username: Option<String>,
) -> Result<String, String> {
    let app_for_error = app.clone();

    let result = tauri::async_runtime::spawn_blocking(move || {
        launch_minecraft_blocking(Some(app), settings, username)
    })
    .await
    .map_err(|error| format!("Фоновая задача запуска сорвалась: {error}"))?;

    if let Err(error) = result.as_ref() {
        emit_progress(
            Some(&app_for_error),
            "launch",
            "Запуск Minecraft",
            error,
            90,
            "error",
        );
    }

    result
}

#[tauri::command]
async fn repair_instance(app: tauri::AppHandle) -> Result<String, String> {
    let app_for_error = app.clone();

    let result = tauri::async_runtime::spawn_blocking(move || repair_instance_blocking(Some(app)))
        .await
        .map_err(|error| format!("Фоновая задача ремонта сорвалась: {error}"))?;

    if let Err(error) = result.as_ref() {
        emit_progress(
            Some(&app_for_error),
            "manifest",
            "Проверка manifest",
            error,
            20,
            "error",
        );
    }

    result
}

#[tauri::command]
async fn get_server_status() -> Result<serde_json::Value, String> {
    tauri::async_runtime::spawn_blocking(get_server_status_blocking)
        .await
        .map_err(|error| format!("Фоновая задача статуса сервера сорвалась: {error}"))?
}

#[tauri::command]
fn append_launcher_log(line: String) -> Result<(), String> {
    let path = launcher_log_path()?;

    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("Не удалось создать папку logs: {error}"))?;
    }

    let mut file = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .map_err(|error| format!("Не удалось открыть launcher.log: {error}"))?;

    file.write_all(line.as_bytes())
        .map_err(|error| format!("Не удалось записать launcher.log: {error}"))?;

    file.write_all(b"\n")
        .map_err(|error| format!("Не удалось записать перенос строки: {error}"))?;

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            prepare_runtime,
            read_settings,
            save_settings,
            launch_minecraft,
            update_instance,
            repair_instance,
            open_game_folder,
            open_logs_folder,
            read_launcher_content,
            get_server_status,
            append_launcher_log
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
