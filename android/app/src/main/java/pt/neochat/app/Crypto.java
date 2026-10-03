package pt.neochat.app;

import android.util.Base64;

import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;

/**
 * Criptografia ponta-a-ponta.
 *
 - AES-256-GCM para o conteudo das mensagens
 - chave de sessao por utilizador, derivada de uma chave publica partilhada
 - assinatura das mensagens para autenticidade
 *
 * Formato do payload (JSON simples, Base64):
 *   iv (12 bytes) : ciphertext : tag
 */
public final class Crypto {

    private static final String TRANSFORM = "AES/GCM/NoPadding";
    private static final int IV_LEN = 12;
    private static final int TAG_BITS = 128;
    private static final SecureRandom RNG = new SecureRandom();

    private final SecretKey sessionKey;

    public Crypto() {
        this.sessionKey = generateKey();
    }

    /** Cria uma chave AES-256 aleatoria. */
    public static SecretKey generateKey() {
        try {
            KeyGenerator kg = KeyGenerator.getInstance("AES");
            kg.init(256);
            return kg.generateKey();
        } catch (Exception e) {
            throw new IllegalStateException("AES nao disponivel", e);
        }
    }

    /** Deriva uma chave de sessao a partir de material partilhado (SHA-256). */
    public static SecretKey deriveFromShared(String sharedMaterial) {
        try {
            java.security.MessageDigest md = java.security.MessageDigest.getInstance("SHA-256");
            byte[] h = md.digest(sharedMaterial.getBytes(StandardCharsets.UTF_8));
            return new SecretKeySpec(h, "AES");
        } catch (Exception e) {
            throw new IllegalStateException("SHA-256 nao disponivel", e);
        }
    }

    public SecretKey sessionKey() {
        return sessionKey;
    }

    /** Chave publica opaca derivada da chave de sessao (para troca). */
    public String publicKeyFingerprint() {
        try {
            java.security.MessageDigest md = java.security.MessageDigest.getInstance("SHA-256");
            byte[] h = md.digest(sessionKey.getEncoded());
            return Base64.encodeToString(h, Base64.NO_WRAP);
        } catch (Exception e) {
            throw new IllegalStateException("SHA-256 nao disponivel", e);
        }
    }

    /**
     * Encripta texto.
     * @return Base64 de iv|ciphertext|tag
     */
    public String encrypt(String plaintext) {
        try {
            byte[] iv = new byte[IV_LEN];
            RNG.nextBytes(iv);

            Cipher c = Cipher.getInstance(TRANSFORM);
            c.init(Cipher.ENCRYPT_MODE, sessionKey, new GCMParameterSpec(TAG_BITS, iv));
            byte[] ct = c.doFinal(plaintext.getBytes(StandardCharsets.UTF_8));

            byte[] out = new byte[iv.length + ct.length];
            System.arraycopy(iv, 0, out, 0, iv.length);
            System.arraycopy(ct, 0, out, iv.length, ct.length);
            return Base64.encodeToString(out, Base64.NO_WRAP);
        } catch (Exception e) {
            throw new IllegalStateException("encriptacao falhou", e);
        }
    }

    /**
     * Desencripta o que foi produzido por {@link #encrypt}.
     * @return texto original, ou null se nao for possivel
     */
    public String decrypt(String b64) {
        try {
            byte[] raw = Base64.decode(b64, Base64.NO_WRAP);
            if (raw.length <= IV_LEN) {
                return null;
            }
            byte[] iv = new byte[IV_LEN];
            System.arraycopy(raw, 0, iv, 0, IV_LEN);
            byte[] ct = new byte[raw.length - IV_LEN];
            System.arraycopy(raw, IV_LEN, ct, 0, ct.length);

            Cipher c = Cipher.getInstance(TRANSFORM);
            c.init(Cipher.DECRYPT_MODE, sessionKey, new GCMParameterSpec(TAG_BITS, iv));
            return new String(c.doFinal(ct), StandardCharsets.UTF_8);
        } catch (Exception e) {
            return null;
        }
    }

    /** Assinatura HMAC do conteudo, para integridade. */
    public String sign(String content) {
        try {
            javax.crypto.Mac mac = javax.crypto.Mac.getInstance("HmacSHA256");
            mac.init(sessionKey);
            byte[] sig = mac.doFinal(content.getBytes(StandardCharsets.UTF_8));
            return Base64.encodeToString(sig, Base64.NO_WRAP);
        } catch (Exception e) {
            throw new IllegalStateException("assinatura falhou", e);
        }
    }

    public boolean verify(String content, String signature) {
        try {
            return sign(content).equals(signature);
        } catch (Exception e) {
            return false;
        }
    }
}
