import { Link } from "react-router-dom";
import { Bar, BarChart, Cell, XAxis, YAxis } from "recharts";
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
              <BarChart
                width={520}
                height={150}
                data={chartData}
                margin={{ top: 6, right: 6, bottom: 0, left: 6 }}
              >
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={{ stroke: "var(--color-border)" }}
                  tick={{ fontSize: 12, fill: "var(--color-ink-muted)" }}
                />
                <YAxis hide />
                <Bar dataKey="total" radius={[6, 6, 0, 0]} isAnimationActive={false}>
                  {chartData.map((entry) => (
                    <Cell
                      key={entry.label}
                      style={{
                        fill: entry.current
                          ? "var(--color-success)"
                          : "var(--color-accent-soft)",
                      }}
                    />
                  ))}
                </Bar>
              </BarChart>
            </div>
          </figure>
        </div>
      )}
    </section>
  );
}
