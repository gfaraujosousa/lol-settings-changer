use serde::{Deserialize, Serialize};
use serde_json::json;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

const SETTINGS_FILE_NAME: &str = "PersistedSettings.json";
const DEFAULT_SETTINGS_PATH: &str = r"C:\Riot Games\League of Legends\Config\PersistedSettings.json";

#[derive(Serialize)]
struct PathStatus {
    kind: String,
    path: Option<String>,
    detail: Option<String>,
}

#[derive(Serialize)]
struct BackupRecord {
    path: String,
    sourcePath: String,
    createdAt: String,
}

#[derive(Serialize)]
#[serde(untagged)]
enum WriteResult {
    Ok { ok: bool, backup: BackupRecord },
    Err {
        ok: bool,
        code: String,
        message: String,
        backupPath: Option<String>,
    },
}

#[derive(Deserialize)]
struct ProfileIndex {
    profiles: serde_json::Value,
}

#[derive(Deserialize)]
struct ActivityIndex {
    entries: serde_json::Value,
}

#[derive(Serialize)]
struct RecoveredStore {
    storePath: String,
    preservedPath: Option<String>,
}

fn status(kind: &str, path: Option<String>, detail: Option<String>) -> PathStatus {
    PathStatus {
        kind: kind.to_string(),
        path,
        detail,
    }
}

fn app_data_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    tauri::api::path::app_data_dir(&app.config())
        .ok_or_else(|| "Could not resolve app data directory.".to_string())
}

fn profiles_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(app_data_dir(app)?.join("profiles.json"))
}

fn activity_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(app_data_dir(app)?.join("activity.json"))
}

fn backup_root(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(app_data_dir(app)?.join("backups"))
}

fn safe_file_token(path: &str) -> String {
    let mut token = path.replace('\\', "/");
    if token.len() >= 2 && token.as_bytes()[1] == b':' {
        token.replace_range(0..1, &token[0..1].to_lowercase());
        token.replace_range(1..2, "");
    }
    token
        .chars()
        .map(|ch| if ch.is_ascii_alphanumeric() { ch.to_ascii_lowercase() } else { '-' })
        .collect::<String>()
        .trim_matches('-')
        .to_string()
}

fn timestamp() -> String {
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or_default();
    millis.to_string()
}

fn backup_dir_for(app: &tauri::AppHandle, target_path: &str) -> Result<PathBuf, String> {
    let token = safe_file_token(target_path);
    Ok(backup_root(app)?.join(if token.is_empty() { "settings" } else { &token }))
}

fn create_backup(app: &tauri::AppHandle, target_path: &Path) -> Result<BackupRecord, String> {
    let target = target_path.to_string_lossy().to_string();
    let token = safe_file_token(&target);
    let created_at = timestamp();
    let backup_dir = backup_dir_for(app, &target)?;
    fs::create_dir_all(&backup_dir).map_err(|error| error.to_string())?;
    let backup_path = backup_dir.join(format!("{}-{}.json", created_at, if token.is_empty() { "settings" } else { &token }));
    fs::copy(target_path, &backup_path).map_err(|error| error.to_string())?;
    enforce_retention(&backup_dir)?;

    Ok(BackupRecord {
        path: backup_path.to_string_lossy().to_string(),
        sourcePath: target,
        createdAt: created_at,
    })
}

fn enforce_retention(backup_dir: &Path) -> Result<(), String> {
    let mut files = fs::read_dir(backup_dir)
        .map_err(|error| error.to_string())?
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|path| path.extension().and_then(|ext| ext.to_str()) == Some("json"))
        .collect::<Vec<_>>();
    files.sort_by(|a, b| b.to_string_lossy().cmp(&a.to_string_lossy()));

    for stale in files.into_iter().skip(10) {
        fs::remove_file(stale).map_err(|error| error.to_string())?;
    }
    Ok(())
}

fn validate_settings_target(target_path: &Path) -> Result<(), WriteResult> {
    if target_path.file_name().and_then(|name| name.to_str()) != Some(SETTINGS_FILE_NAME) {
        return Err(WriteResult::Err {
            ok: false,
            code: "wrong_file".to_string(),
            message: "Choose PersistedSettings.json.".to_string(),
            backupPath: None,
        });
    }

    if !target_path.exists() {
        return Err(WriteResult::Err {
            ok: false,
            code: "missing".to_string(),
            message: "Select the settings file.".to_string(),
            backupPath: None,
        });
    }

    Ok(())
}

fn safe_write_settings(app: &tauri::AppHandle, target_path: String, next_contents: String) -> WriteResult {
    let target = PathBuf::from(target_path);
    if let Err(result) = validate_settings_target(&target) {
        return result;
    }

    let current = match fs::read_to_string(&target) {
        Ok(contents) => contents,
        Err(error) => {
            return WriteResult::Err {
                ok: false,
                code: "missing".to_string(),
                message: error.to_string(),
                backupPath: None,
            };
        }
    };

    if serde_json::from_str::<serde_json::Value>(&current).is_err() {
        return WriteResult::Err {
            ok: false,
            code: "invalid_current_json".to_string(),
            message: "Choose a valid settings file.".to_string(),
            backupPath: None,
        };
    }

    if serde_json::from_str::<serde_json::Value>(&next_contents).is_err() {
        return WriteResult::Err {
            ok: false,
            code: "invalid_next_json".to_string(),
            message: "Choose a valid settings file.".to_string(),
            backupPath: None,
        };
    }

    let backup = match create_backup(app, &target) {
        Ok(backup) => backup,
        Err(error) => {
            return WriteResult::Err {
                ok: false,
                code: "backup_failed".to_string(),
                message: error,
                backupPath: None,
            };
        }
    };

    let temp_path = target.with_file_name(format!("{}.tmp", SETTINGS_FILE_NAME));
    let write_result = fs::write(&temp_path, next_contents)
        .and_then(|_| fs::rename(&temp_path, &target))
        .and_then(|_| fs::read_to_string(&target))
        .and_then(|written| {
            serde_json::from_str::<serde_json::Value>(&written)
                .map(|_| ())
                .map_err(|error| std::io::Error::new(std::io::ErrorKind::InvalidData, error.to_string()))
        });

    match write_result {
        Ok(()) => WriteResult::Ok { ok: true, backup },
        Err(error) => match fs::copy(&backup.path, &target) {
            Ok(_) => WriteResult::Err {
                ok: false,
                code: "write_failed_rollback_succeeded".to_string(),
                message: "The write failed. Your previous settings were restored.".to_string(),
                backupPath: Some(backup.path),
            },
            Err(_) => WriteResult::Err {
                ok: false,
                code: "write_failed_rollback_failed".to_string(),
                message: error.to_string(),
                backupPath: Some(backup.path),
            },
        },
    }
}

#[tauri::command]
fn detect_default_settings_path() -> Option<String> {
    let path = PathBuf::from(DEFAULT_SETTINGS_PATH);
    path.exists().then(|| DEFAULT_SETTINGS_PATH.to_string())
}

#[tauri::command]
fn validate_settings_path(path: String) -> PathStatus {
    let trimmed = path.trim().to_string();
    if trimmed.is_empty() {
        return status("not_selected", None, None);
    }

    let selected = Path::new(&trimmed);
    if selected.file_name().and_then(|name| name.to_str()) != Some(SETTINGS_FILE_NAME) {
        return status("wrong_file", Some(trimmed), None);
    }

    if !selected.exists() {
        return status("missing", Some(trimmed), None);
    }

    match fs::read_to_string(selected)
        .map_err(|error| error.to_string())
        .and_then(|contents| serde_json::from_str::<serde_json::Value>(&contents).map_err(|error| error.to_string()))
    {
        Ok(_) => status("valid", Some(trimmed), None),
        Err(error) => status("invalid_json", Some(trimmed), Some(error)),
    }
}

#[tauri::command]
fn read_settings_file(path: String) -> Result<String, String> {
    let selected = PathBuf::from(path);
    if selected.file_name().and_then(|name| name.to_str()) != Some(SETTINGS_FILE_NAME) {
        return Err("Choose PersistedSettings.json.".to_string());
    }
    let contents = fs::read_to_string(selected).map_err(|error| error.to_string())?;
    serde_json::from_str::<serde_json::Value>(&contents).map_err(|error| error.to_string())?;
    Ok(contents)
}

#[tauri::command]
fn load_profile_index(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let path = profiles_path(&app)?;
    if !path.exists() {
        return Ok(None);
    }

    fs::read_to_string(path)
        .map(Some)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn save_profile_index(app: tauri::AppHandle, index: ProfileIndex) -> Result<(), String> {
    let path = profiles_path(&app)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let value = json!({ "profiles": index.profiles });
    let contents = serde_json::to_string_pretty(&value).map_err(|error| error.to_string())?;
    fs::write(path, contents).map_err(|error| error.to_string())
}

#[tauri::command]
fn load_activity_index(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let path = activity_path(&app)?;
    if !path.exists() {
        return Ok(None);
    }

    fs::read_to_string(path)
        .map(Some)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn save_activity_index(app: tauri::AppHandle, index: ActivityIndex) -> Result<(), String> {
    let path = activity_path(&app)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let value = json!({ "entries": index.entries });
    let contents = serde_json::to_string_pretty(&value).map_err(|error| error.to_string())?;
    fs::write(path, contents).map_err(|error| error.to_string())
}

fn preserved_store_path(path: &Path) -> PathBuf {
    let file_stem = path.file_stem().and_then(|name| name.to_str()).unwrap_or("store");
    let extension = path.extension().and_then(|ext| ext.to_str()).unwrap_or("json");
    path.with_file_name(format!("{}.corrupt-{}.{}", file_stem, timestamp(), extension))
}

fn preserve_then_reset_store(path: PathBuf, empty_value: serde_json::Value) -> Result<RecoveredStore, String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }

    let preserved_path = if path.exists() {
        let preserved = preserved_store_path(&path);
        fs::rename(&path, &preserved).map_err(|error| error.to_string())?;
        Some(preserved)
    } else {
        None
    };

    let contents = serde_json::to_string_pretty(&empty_value).map_err(|error| error.to_string())?;
    fs::write(&path, contents).map_err(|error| error.to_string())?;

    Ok(RecoveredStore {
        storePath: path.to_string_lossy().to_string(),
        preservedPath: preserved_path.map(|path| path.to_string_lossy().to_string()),
    })
}

#[tauri::command]
fn recover_profile_index(app: tauri::AppHandle) -> Result<RecoveredStore, String> {
    preserve_then_reset_store(profiles_path(&app)?, json!({ "profiles": [] }))
}

#[tauri::command]
fn recover_activity_index(app: tauri::AppHandle) -> Result<RecoveredStore, String> {
    preserve_then_reset_store(activity_path(&app)?, json!({ "entries": [] }))
}

#[tauri::command]
fn apply_settings_profile(app: tauri::AppHandle, target_path: String, settings_json: String) -> WriteResult {
    safe_write_settings(&app, target_path, settings_json)
}

#[tauri::command]
fn list_settings_backups(app: tauri::AppHandle, target_path: String) -> Result<Vec<BackupRecord>, String> {
    let backup_dir = backup_dir_for(&app, &target_path)?;
    if !backup_dir.exists() {
        return Ok(Vec::new());
    }

    let mut backups = fs::read_dir(backup_dir)
        .map_err(|error| error.to_string())?
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|path| path.extension().and_then(|ext| ext.to_str()) == Some("json"))
        .map(|path| {
            let file_name = path.file_name().and_then(|name| name.to_str()).unwrap_or_default();
            let created_at = file_name
                .split('-')
                .next()
                .and_then(|millis| millis.parse::<u128>().ok())
                .map(|millis| millis.to_string())
                .unwrap_or_else(|| file_name.to_string());
            BackupRecord {
                path: path.to_string_lossy().to_string(),
                sourcePath: target_path.clone(),
                createdAt: created_at,
            }
        })
        .collect::<Vec<_>>();
    backups.sort_by(|a, b| b.path.cmp(&a.path));
    Ok(backups)
}

#[tauri::command]
fn restore_settings_backup(app: tauri::AppHandle, target_path: String, backup_path: String) -> WriteResult {
    let backup = PathBuf::from(&backup_path);
    if !backup.exists() {
        return WriteResult::Err {
            ok: false,
            code: "missing_backup".to_string(),
            message: "Backup file not found.".to_string(),
            backupPath: None,
        };
    }

    let contents = match fs::read_to_string(&backup) {
        Ok(contents) => contents,
        Err(error) => {
            return WriteResult::Err {
                ok: false,
                code: "missing_backup".to_string(),
                message: error.to_string(),
                backupPath: None,
            };
        }
    };

    if serde_json::from_str::<serde_json::Value>(&contents).is_err() {
        return WriteResult::Err {
            ok: false,
            code: "invalid_backup_json".to_string(),
            message: "Backup file is invalid.".to_string(),
            backupPath: None,
        };
    }

    safe_write_settings(&app, target_path, contents)
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            detect_default_settings_path,
            validate_settings_path,
            read_settings_file,
            load_profile_index,
            save_profile_index,
            load_activity_index,
            save_activity_index,
            recover_profile_index,
            recover_activity_index,
            apply_settings_profile,
            list_settings_backups,
            restore_settings_backup
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
