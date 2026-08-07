import { Link } from "react-router-dom";
import { formatNumber } from "../../../shared/format";
import type { WeeklyVolume } from "../api/dashboard-api";
import styles from "./WeeklyVolumeBlock.module.css";

type WeeklyVolumeBlockProps = {
  volume: WeeklyVolume;
};

function comparisonLabel(volume: WeeklyVolume): string {
  if (volume.changePercent === null) {
    return "Sin datos de la semana anterior";
  }
  const sign = volume.changePercent > 0 ? "+" : "";
  return `${sign}${formatNumber(volume.changePercent)} % frente a la semana anterior`;
}

/**
 * Tercer bloque de Inicio: el volumen de fuerza en `kg·rep` de la semana
 * actual, su comparación con la anterior y las barras de las últimas seis
 * semanas. La API entrega los totales agregados (spec «Métricas»); el bloque
 * solo los presenta. Sin datos no se dibuja ninguna gráfica: el estado vacío
 * explica qué falta y enlaza al Historial.
 */
export function WeeklyVolumeBlock({ volume }: WeeklyVolumeBlockProps) {
  const hasData = volume.weeks.some((week) => week.total > 0);

  const chartData = volume.weeks.map((week, index, weeks) => ({
    label: index === weeks.length - 1 ? "Actual" : `S-${weeks.length - 1 - index}`,
    total: week.total,
    current: index === weeks.length - 1,
  }));
  const maxTotal = Math.max(...chartData.map((entry) => entry.total), 1);

  // Alternativa textual completa de la gráfica: título, unidad y cada valor.
  const chartLabel =
    chartData.length === 0
      ? "Volumen de las últimas seis semanas en kg·rep"
      : `Volumen de las últimas seis semanas en kg·rep: ${chartData
          .map((entry) => `${entry.label} ${formatNumber(entry.total)}`)
          .join(", ")}`;

  return (
    <section className={styles.card} aria-labelledby="volumen-semanal">
      <h2 className={styles.title} id="volumen-semanal">
        Volumen semanal
      </h2>

      {!hasData && (
        <div className={styles.emptyCard}>
          <p className={styles.emptyText}>
            Aún no hay volumen semanal. Completa Sesiones con Ejercicios de
            fuerza con carga y verás aquí tu tendencia de las últimas seis
            semanas.
          </p>
          <Link className={styles.emptyAction} to="/historial">
            Ver tu Historial
          </Link>
        </div>
      )}

      {hasData && (
        <div className={styles.volumeCard}>
          <p className={styles.statLine}>
            <span className={styles.stat}>{formatNumber(volume.currentTotal)}</span>
            <span className={styles.unit}>kg·rep</span>
          </p>
          <p className={styles.comparison}>{comparisonLabel(volume)}</p>
          <figure className={styles.chartFigure}>
            {/* La gráfica es una imagen con alternativa textual; el color no
                es la única vía de lectura (la barra actual se distingue
                además por su etiqueta «Actual»). */}
            <div className={styles.chart} role="img" aria-label={chartLabel}>
              <div className={styles.barPlot} aria-hidden="true">
                {chartData.map((entry) => (
                  <div className={styles.barColumn} key={entry.label}>
                    <div
                      className={`${styles.bar} ${entry.current ? styles.currentBar : ""}`}
                      style={{ height: `${(entry.total / maxTotal) * 100}%` }}
                    />
                  </div>
                ))}
              </div>
              <div className={styles.chartLabels} aria-hidden="true">
                {chartData.map((entry) => (
                  <span className={entry.current ? styles.currentLabel : undefined} key={entry.label}>
                    {entry.label}
                  </span>
                ))}
              </div>
            </div>
          </figure>
        </div>
      )}
    </section>
  );
}
