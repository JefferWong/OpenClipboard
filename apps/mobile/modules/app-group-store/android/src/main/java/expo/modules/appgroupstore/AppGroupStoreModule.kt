package expo.modules.appgroupstore

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.json.JSONObject
import java.security.KeyStore
import java.util.UUID
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * Android counterpart of the iOS AppGroupStore credential methods. The
 * ciphertext lives in private SharedPreferences; the AES-GCM key is generated
 * and retained by Android Keystore, so neither the configuration nor the
 * preference file contains a recoverable plaintext credential.
 */
class AppGroupStoreModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("AppGroupStore")

    AsyncFunction("putCredential") { reference: String?, username: String, password: String ->
      val ref = reference?.takeIf { it.isNotBlank() } ?: UUID.randomUUID().toString()
      val plaintext = JSONObject().put("username", username).put("password", password).toString()
      val encrypted = encrypt(plaintext.toByteArray(Charsets.UTF_8))
      preferences().edit().putString(ref, encrypted).commit()
      ref
    }

    AsyncFunction("getCredential") { reference: String ->
      val encrypted = preferences().getString(reference, null)
      if (encrypted == null) null else decrypt(encrypted).toString(Charsets.UTF_8)
    }

    AsyncFunction("deleteCredential") { reference: String ->
      preferences().edit().remove(reference).commit()
      Unit
    }
  }

  private fun preferences() = appContext.reactContext
    ?.getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)
    ?: throw IllegalStateException("React context is unavailable")

  private fun encrypt(plaintext: ByteArray): String {
    val cipher = Cipher.getInstance(TRANSFORMATION)
    cipher.init(Cipher.ENCRYPT_MODE, key())
    val cipherText = cipher.doFinal(plaintext)
    return Base64.encodeToString(cipher.iv, Base64.NO_WRAP) + "." +
      Base64.encodeToString(cipherText, Base64.NO_WRAP)
  }

  private fun decrypt(encoded: String): ByteArray {
    val parts = encoded.split('.', limit = 2)
    require(parts.size == 2) { "Malformed credential ciphertext" }
    val iv = Base64.decode(parts[0], Base64.NO_WRAP)
    val cipherText = Base64.decode(parts[1], Base64.NO_WRAP)
    val cipher = Cipher.getInstance(TRANSFORMATION)
    cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(GCM_TAG_BITS, iv))
    return cipher.doFinal(cipherText)
  }

  private fun key(): SecretKey {
    val keyStore = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }
    (keyStore.getKey(KEY_ALIAS, null) as? SecretKey)?.let { return it }

    val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEYSTORE)
    generator.init(
      KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
        .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
        .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
        .setKeySize(256)
        .build()
    )
    return generator.generateKey()
  }

  private companion object {
    const val PREFERENCES_NAME = "uniclipboard.credential-vault.v1"
    const val KEY_ALIAS = "uniclipboard.credential-vault.v1"
    const val ANDROID_KEYSTORE = "AndroidKeyStore"
    const val TRANSFORMATION = "AES/GCM/NoPadding"
    const val GCM_TAG_BITS = 128
  }
}
