/**
 * NEOCHAT Crypto Module
 * End-to-end encryption for anonymous messaging
 */

class NEOCrypto {
    constructor() {
        this.algorithm = 'AES-GCM';
        this.keyLength = 256;
        this.ivLength = 12;
    }

    /**
     * Generate a cryptographic key pair for the user
     */
    async generateKeyPair() {
        if (typeof crypto !== 'undefined' && crypto.subtle) {
            return await crypto.subtle.generateKey(
                { name: "ECDH", namedCurve: "P-256" },
                true,
                ["deriveKey", "deriveBits"]
            );
        }
        // Fallback for older environments
        return this._generateFallbackKey();
    }

    /**
     * Generate a shared secret from key exchange
     */
    async deriveSharedSecret(privateKey, publicKey) {
        if (typeof crypto !== 'undefined' && crypto.subtle) {
            return await crypto.subtle.deriveKey(
                { name: "ECDH", public: publicKey },
                privateKey,
                { name: "AES-GCM", length: 256 },
                true,
                ["encrypt", "decrypt"]
            );
        }
        return this._fallbackDerive(privateKey, publicKey);
    }

    /**
     * Encrypt a message
     */
    async encryptMessage(message, key) {
        try {
            const encoder = new TextEncoder();
            const data = encoder.encode(message);
            const iv = crypto.getRandomValues(new Uint8Array(this.ivLength));
            
            if (typeof crypto !== 'undefined' && crypto.subtle) {
                const encrypted = await crypto.subtle.encrypt(
                    { name: "AES-GCM", iv: iv },
                    key,
                    data
                );
                
                return {
                    content: this._arrayBufferToBase64(encrypted),
                    nonce: this._arrayBufferToBase64(iv)
                };
            }
            return this._fallbackEncrypt(message, key, iv);
        } catch (error) {
            console.error('[CRYPTO] Encryption failed:', error);
            throw error;
        }
    }

    /**
     * Decrypt a message
     */
    async decryptMessage(encryptedData, key) {
        try {
            const { content, nonce } = encryptedData;
            const encrypted = this._base64ToArrayBuffer(content);
            const iv = this._base64ToArrayBuffer(nonce);
            
            if (typeof crypto !== 'undefined' && crypto.subtle) {
                const decrypted = await crypto.subtle.decrypt(
                    { name: "AES-GCM", iv: iv },
                    key,
                    encrypted
                );
                
                const decoder = new TextDecoder();
                return decoder.decode(decrypted);
            }
            return this._fallbackDecrypt(encrypted, key, iv);
        } catch (error) {
            console.error('[CRYPTO] Decryption failed:', error);
            return '[MENSAGEM CORROMPIDA]';
        }
    }

    /**
     * Generate a random nickname
     */
    generateNickname() {
        const prefixes = ['neon', 'cyber', 'quantum', 'phantom', 'ghost', 
                          'neuro', 'synth', 'dark', 'zero', 'shadow', 
                          'nova', 'hex', 'matrix', 'crypto', 'void'];
        const suffixes = ['x', 'z', '0r', '7', '_neo', '_chat', '_net',
                          'punk', 'lab', 'core', 'byte', 'bit'];
        
        const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
        const suffix = suffixes[Math.floor(Math.random() * suffixes.length)];
        const num = Math.floor(Math.random() * 9999);
        
        return `${prefix}${suffix}${num}`;
    }

    /**
     * Generate a random channel ID
     */
    generateChannelId() {
        const chars = '0123456789abcdef';
        let id = '';
        for (let i = 0; i < 32; i++) {
            id += chars[Math.floor(Math.random() * chars.length)];
        }
        return id;
    }

    /**
     * Hash a message for integrity verification
     */
    async hashMessage(message) {
        const encoder = new TextEncoder();
        const data = encoder.encode(message);
        
        if (typeof crypto !== 'undefined' && crypto.subtle) {
            const hashBuffer = await crypto.subtle.digest('SHA-256', data);
            return this._arrayBufferToHex(hashBuffer);
        }
        return this._fallbackHash(message);
    }

    /**
     * Generate a digital signature
     */
    async signMessage(message, key) {
        const msgHash = await this.hashMessage(message);
        const keyBytes = this._stringToBytes(JSON.stringify(key));
        
        // Simple HMAC-style signature
        let signature = '';
        for (let i = 0; i < msgHash.length; i++) {
            const a = msgHash.charCodeAt(i);
            const b = keyBytes[i % keyBytes.length];
            signature += String.fromCharCode(a ^ b).charCodeAt(0).toString(16).padStart(2, '0');
        }
        
        return signature.slice(0, 64); // 32-byte signature
    }

    /**
     * Verify a signature
     */
    async verifySignature(message, signature, key) {
        const expectedSig = await this.signMessage(message, key);
        return signature === expectedSig;
    }

    // --- Utility Methods ---

    _arrayBufferToBase64(buffer) {
        if (buffer instanceof ArrayBuffer) {
            return btoa(String.fromCharCode(...new Uint8Array(buffer)));
        }
        return btoa(String.fromCharCode(...buffer));
    }

    _base64ToArrayBuffer(base64) {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes.buffer;
    }

    _arrayBufferToHex(buffer) {
        const bytes = new Uint8Array(buffer);
        let hex = '';
        for (let i = 0; i < bytes.length; i++) {
            hex += bytes[i].toString(16).padStart(2, '0');
        }
        return hex;
    }

    _stringToBytes(str) {
        const encoder = new TextEncoder();
        return encoder.encode(str);
    }

    _generateFallbackKey() {
        const bytes = new Uint8Array(32);
        for (let i = 0; i < 32; i++) {
            bytes[i] = Math.floor(Math.random() * 256);
        }
        return { raw: Array.from(bytes) };
    }

    _fallbackDerive(privateKey, publicKey) {
        return { key: this._arrayBufferToBase64(new Uint8Array(32)) };
    }

    _fallbackEncrypt(message, key, iv) {
        const encoder = new TextEncoder();
        const data = encoder.encode(message);
        const keyBytes = this._stringToBytes(JSON.stringify(key));
        const encrypted = new Uint8Array(data.length);
        
        for (let i = 0; i < data.length; i++) {
            encrypted[i] = data[i] ^ keyBytes[i % keyBytes.length] ^ iv[i % iv.length];
        }
        
        return {
            content: this._arrayBufferToBase64(encrypted),
            nonce: this._arrayBufferToBase64(iv)
        };
    }

    _fallbackDecrypt(encrypted, key, iv) {
        const keyBytes = this._stringToBytes(JSON.stringify(key));
        const decrypted = new Uint8Array(encrypted.length);
        
        for (let i = 0; i < encrypted.length; i++) {
            decrypted[i] = encrypted[i] ^ keyBytes[i % keyBytes.length] ^ iv[i % iv.length];
        }
        
        const decoder = new TextDecoder();
        return decoder.decode(decrypted);
    }

    _fallbackHash(message) {
        let hash = 0;
        for (let i = 0; i < message.length; i++) {
            const char = message.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return hash.toString(16).padStart(16, '0');
    }
}

// Initialize crypto instance
const cryptoModule = new NEOCrypto();

/**
 * Generate a Tor-style .onion address (v3)
 */
function generateOnionAddress() {
    const chars = 'abcdefghijklmnopqrstuvwxyz234567';
    let addr = '';
    for (let i = 0; i < 56; i++) {
        addr += chars[Math.floor(Math.random() * chars.length)];
    }
    return `${addr}.onion`;
}

/**
 * Simulate WiFi/BT mesh peer discovery
 */
function simulateMeshDiscovery() {
    const devices = [];
    const count = Math.floor(Math.random() * 5) + 2;
    
    for (let i = 0; i < count; i++) {
        devices.push({
            name: cryptoModule.generateNickname(),
            mac: `00:${Math.random().toString(16).slice(2,4)}:${Math.random().toString(16).slice(2,4)}:${Math.random().toString(16).slice(2,4)}:${Math.random().toString(16).slice(2,4)}:${Math.random().toString(16).slice(2,4)}`,
            signal: Math.floor(Math.random() * 100) - 30,
            encrypted: Math.random() > 0.5
        });
    }
    
    return devices;
}

// Export for use in chat.js (Node.js compatible)
module.exports = {
    NEOCrypto: cryptoModule,
    generateOnionAddress,
    simulateMeshDiscovery
};
