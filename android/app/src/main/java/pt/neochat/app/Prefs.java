package pt.neochat.app;

import android.content.Context;
import android.content.SharedPreferences;

/** Persistencia simples de preferencias (servidor, nick, canal). */
public final class Prefs {
    private static final String FILE = "neochat_prefs";
    private final SharedPreferences sp;

    public Prefs(Context ctx) {
        this.sp = ctx.getSharedPreferences(FILE, Context.MODE_PRIVATE);
    }

    public String server() {
        String s = sp.getString("server", null);
        return (s == null || s.isEmpty()) ? BuildConfig.DEFAULT_SERVER : s;
    }

    public void setServer(String value) {
        sp.edit().putString("server", value).apply();
    }

    public String nickname() {
        return sp.getString("nickname", "");
    }

    public void setNickname(String value) {
        sp.edit().putString("nickname", value).apply();
    }

    public String channel() {
        return sp.getString("channel", "neochat");
    }

    public void setChannel(String value) {
        sp.edit().putString("channel", value).apply();
    }

    public boolean encrypted() {
        return sp.getBoolean("encrypted", true);
    }

    public void setEncrypted(boolean value) {
        sp.edit().putBoolean("encrypted", value).apply();
    }
}
