package pt.neochat.app;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Path;
import android.view.View;

/**
 * Mapa GPS desenhado nativamente (sem Google Maps, sem chaves de API).
 *
 * Projecao equirectangular sobre Portugal continental + ilhas,
 * com a posicao do utilizador e as cidades de referencia.
 */
public final class GpsMapView extends View {

    private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint text = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Path land = new Path();

    private double lat = 0, lng = 0;
    private boolean hasFix = false;

    // Portugal continental (lat 36.9..42.2, lng -9.6..-6.1) + ilhas
    private static final double LAT_MIN = 36.9, LAT_MAX = 42.2;
    private static final double LNG_MIN = -9.7, LNG_MAX = -6.0;

    public GpsMapView(Context ctx) {
        super(ctx);
        setBackgroundColor(Color.parseColor("#03080a"));
        text.setColor(Color.parseColor("#00ff44"));
        text.setTextSize(dp(10));
        text.setTypeface(android.graphics.Typeface.MONOSPACE);
        traceLandmass();
    }

    private float dp(int v) {
        return v * getResources().getDisplayMetrics().density;
    }

    /** Igual a {@link #dp(int)} mas sem truncar (para espessuras e raios). */
    private float dpf(float v) {
        return v * getResources().getDisplayMetrics().density;
    }

    public void setPosition(double la, double ln) {
        this.lat = la;
        this.lng = ln;
        this.hasFix = true;
        invalidate();
    }

    /** Traçado simplificado de Portugal continental. */
    private void traceLandmass() {
        // (lat, lng) em graus, contorno grosseiro mas reconhecível
        double[][] pts = {
                {42.15, -8.87}, {41.88, -8.60}, {41.35, -8.60}, {41.05, -8.20},
                {40.50, -8.20}, {40.20, -8.80}, {39.60, -8.90}, {39.40, -8.80},
                {38.95, -9.20}, {38.70, -9.20}, {38.45, -9.20}, {38.10, -8.90},
                {37.70, -8.80}, {37.40, -8.80}, {37.10, -7.40}, {37.05, -7.30},
                {37.35, -7.00}, {37.55, -7.40}, {38.00, -7.40}, {38.50, -7.30},
                {39.30, -7.10}, {39.60, -7.00}, {40.20, -6.90}, {40.80, -6.90},
                {41.15, -6.60}, {41.60, -6.45}, {41.85, -6.55}, {42.15, -8.87},
        };
        land.reset();
        for (int i = 0; i < pts.length; i++) {
            float x = projectX(pts[i][1]);
            float y = projectY(pts[i][0]);
            if (i == 0) land.moveTo(x, y);
            else land.lineTo(x, y);
        }
        land.close();
    }

    private float projectX(double lng) {
        return (float) (((lng - LNG_MIN) / (LNG_MAX - LNG_MIN)) * getWidth());
    }

    private float projectY(double lat) {
        float h = getHeight();
        return (float) (h - (((lat - LAT_MIN) / (LAT_MAX - LAT_MIN)) * h));
    }

    @Override
    protected void onDraw(Canvas c) {
        super.onDraw(c);

        // grelha
        paint.setStyle(Paint.Style.STROKE);
        paint.setStrokeWidth(dpf(0.5f));
        paint.setColor(Color.parseColor("#0a3a1a"));
        for (int i = 1; i < 5; i++) {
            c.drawLine(getWidth() * i / 5f, 0, getWidth() * i / 5f, getHeight(), paint);
            c.drawLine(0, getHeight() * i / 5f, getWidth(), getHeight() * i / 5f, paint);
        }

        // terra
        paint.setStyle(Paint.Style.FILL);
        paint.setColor(Color.parseColor("#06210f"));
        c.drawPath(land, paint);
        paint.setStyle(Paint.Style.STROKE);
        paint.setStrokeWidth(dpf(1.2f));
        paint.setColor(Color.parseColor("#00ff44"));
        c.drawPath(land, paint);

        // cidades
        GpsLocator.City[] cities = {
                new GpsLocator.City("Lisboa", 38.72, -9.14, -1),
                new GpsLocator.City("Porto", 41.16, -8.63, -1),
                new GpsLocator.City("Coimbra", 40.20, -8.41, -1),
                new GpsLocator.City("Faro", 37.02, -7.93, -1),
                new GpsLocator.City("Braga", 41.55, -8.43, -1),
        };
        paint.setStyle(Paint.Style.FILL);
        for (GpsLocator.City city : cities) {
            float x = projectX(city.lng);
            float y = projectY(city.lat);
            paint.setColor(Color.parseColor("#ffaa00"));
            c.drawCircle(x, y, dpf(2.5f), paint);
            c.drawText(city.name, x + dp(5), y + dp(3), text);
        }

        // posicao do utilizador
        if (hasFix && lat >= LAT_MIN && lat <= LAT_MAX && lng >= LNG_MIN && lng <= LNG_MAX) {
            float x = projectX(lng);
            float y = projectY(lat);
            paint.setColor(Color.parseColor("#ff4444"));
            c.drawCircle(x, y, dpf(5f), paint);
            paint.setStyle(Paint.Style.STROKE);
            paint.setStrokeWidth(dpf(1f));
            c.drawCircle(x, y, dpf(9f), paint);
            c.drawText("VOCE", x + dp(11), y, text);
        } else if (!hasFix) {
            c.drawText("> SEM FIX GPS", dp(8), getHeight() - dp(8), text);
        }

        c.drawText("PORTUGAL", dp(8), dp(14), text);
    }
}
