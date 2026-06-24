use aes_gcm::{
    aead::{rand_core::RngCore, Aead, KeyInit, OsRng},
    Aes256Gcm, Nonce,
};

use base64::{engine::general_purpose::STANDARD, Engine as _};

use sha2::{Digest, Sha256};

use crate::errors::ApiError;

pub fn sha256_hex(value: &str) -> String {
    let mut hasher = Sha256::new();

    hasher.update(value.as_bytes());

    hex::encode(hasher.finalize())
}

pub struct EmailCrypto {
    cipher: Aes256Gcm,
}

impl EmailCrypto {
    pub fn new(hex_key: &str) -> Result<Self, ApiError> {
        let key = hex::decode(hex_key)
            .map_err(|_| ApiError::Internal("invalid email encryption key".to_string()))?;

        if key.len() != 32 {
            return Err(ApiError::Internal(
                "email encryption key must be 32 bytes".to_string(),
            ));
        }

        let cipher = Aes256Gcm::new_from_slice(&key)
            .map_err(|_| ApiError::Internal("failed to create email cipher".to_string()))?;

        Ok(Self { cipher })
    }

    pub fn encrypt(&self, plain_text: &str) -> Result<String, ApiError> {
        let mut nonce_bytes = [0u8; 12];

        OsRng.fill_bytes(&mut nonce_bytes);

        let nonce = Nonce::from_slice(&nonce_bytes);

        let cipher_text = self
            .cipher
            .encrypt(nonce, plain_text.as_bytes())
            .map_err(|_| ApiError::Internal("failed to encrypt email".to_string()))?;

        let mut payload = nonce_bytes.to_vec();

        payload.extend(cipher_text);

        Ok(format!("v1:{}", STANDARD.encode(payload)))
    }

    pub fn decrypt(&self, encrypted: &str) -> Result<String, ApiError> {
        let payload = encrypted
            .strip_prefix("v1:")
            .ok_or_else(|| ApiError::Internal("invalid encrypted email format".to_string()))?;

        let bytes = STANDARD
            .decode(payload)
            .map_err(|_| ApiError::Internal("failed to decode encrypted email".to_string()))?;

        if bytes.len() <= 12 {
            return Err(ApiError::Internal(
                "encrypted email payload is too short".to_string(),
            ));
        }

        let (nonce_bytes, cipher_text) = bytes.split_at(12);

        let nonce = Nonce::from_slice(nonce_bytes);

        let plain_text = self
            .cipher
            .decrypt(nonce, cipher_text)
            .map_err(|_| ApiError::Internal("failed to decrypt email".to_string()))?;

        String::from_utf8(plain_text)
            .map_err(|_| ApiError::Internal("decrypted email is not utf8".to_string()))
    }
}
