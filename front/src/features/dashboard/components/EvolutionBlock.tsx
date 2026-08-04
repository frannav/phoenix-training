import { Link } from "react-router-dom";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { formatDomainDate, formatNumber } from "../../../shared/format";
import type {
  EvolutionMetric,
  EvolutionOption,
  EvolutionPoint,
  ExerciseEvolution,
} from "../api/dashboard-api";
import styles from "./EvolutionBlock.module.css";

type EvolutionBlockProps = {
  options: EvolutionOption[];
  current: ExerciseEvolution | null;
  onSelectExercise: (exerciseId: string) => void;
};

/** Métrica propia de la Forma de registro y su unidad (spec «Métricas»). */
const metricLabels: Record<EvolutionMetric, { label: string; unit: string }> = {
  carga_maxima: { label: "Carga máxima", unit: "kg" },
  repeticiones_totales: { label: "Repeticiones totales", unit: "rep" },
  duracion_total: { label: "Duración total", unit: "s" },
};

// Colores del tema (global.css) aplicados a las gráficas: se usan valores
// literales en los atributos de presentación de SVG, donde `var()` no es
// fiable entre navegadores.
const COLOR_SUCCESS = "#28633c";
const COLOR_BORDER = "#d9ddd3";
const COLOR_INK_MUTED = "#687064";

function sortByName(options: EvolutionOption[]): EvolutionOption[] {
  return [...options].sort((a, b) => a.name.localeCompare(b.name, "es"));
}

type EvolutionChartProps = {
  name: string;
  metric: EvolutionMetric;
  points: EvolutionPoint[];
};

/**
 * Serie temporal de la evolución: la gráfica de líneas con su alternativa
 * textual completa —título, métrica, unidad y cada punto— y el resumen con el
 * último valor y el número de Sesiones. El color no es la única vía de
 * lectura.
 */
function EvolutionChart({ name, metric, points }: EvolutionChartProps) {
  const metricInfo = metricLabels[metric];
  const lastValue = points.at(-1)!.value;
  const sessionCount = points.length === 1 ? "1 Sesión" : `${points.length} Sesiones`;

  const chartLabel =
    `Evolución de ${name}: ${metricInfo.label} en ${metricInfo.unit}: ` +
    points
      .map(
        (point) =>
          `${formatNumber(point.value)} ${metricInfo.unit} el ${formatDomainDate(point.date)}`,
      )
      .join(", ");

  return (
    <div className={styles.evolutionCard}>
      <p className={styles.metricLine}>
        <span className={styles.metricLabel}>{metricInfo.label}</span>
        <span className={styles.metricUnit}>{metricInfo.unit}</span>
      </p>

      <figure className={styles.chartFigure}>
        <div className={styles.chart} role="img" aria-label={chartLabel}>
          <LineChart
            width={520}
            height={150}
            data={points.map((point) => ({
              date: formatDomainDate(point.date),
              value: point.value,
            }))}
            margin={{ top: 6, right: 6, bottom: 0, left: 6 }}
          >
            <CartesianGrid stroke={COLOR_BORDER} vertical={false} />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={{ stroke: COLOR_BORDER }}
              tick={{ fontSize: 11, fill: COLOR_INK_MUTED }}
            />
            <YAxis hide />
            <Line
              type="monotone"
              dataKey="value"
              stroke={COLOR_SUCCESS}
              strokeWidth={2.5}
              dot={{ r: 3, fill: COLOR_SUCCESS }}
              isAnimationActive={false}
            />
          </LineChart>
        </div>
      </figure>

      <p className={styles.summary}>
        Último valor: <strong>{formatNumber(lastValue)} {metricInfo.unit}</strong> ·{" "}
        {sessionCount}
      </p>
    </div>
  );
}

/**
 * Quinto bloque de Inicio: la evolución de un Ejercicio elegible mediante su
 * serie temporal con la métrica propia de su Forma de registro. Los puntos
 * llegan agregados por la API; la gráfica se acompaña de título, unidad,
 * valor textual y resumen, y el color no es la única vía de lectura. El
 * cardio continuo conserva su opción pero informa de que no dispone de
 * analítica, y sin opciones no se dibuja ninguna gráfica.
 */
export function EvolutionBlock({
  options,
  current,
  onSelectExercise,
}: EvolutionBlockProps) {
  const sortedOptions = sortByName(options);

  if (sortedOptions.length === 0) {
    return (
      <section className={styles.card} aria-labelledby="evolucion">
        <h2 className={styles.title} id="evolucion">
          Evolución
        </h2>
        <div className={styles.emptyCard}>
          <p className={styles.emptyText}>
            Aún no hay evolución que mostrar. Completa Sesiones y verás aquí la
            evolución de cada Ejercicio con su propia métrica.
          </p>
          <Link className={styles.emptyAction} to="/historial">
            Ir al Historial
          </Link>
        </div>
      </section>
    );
  }

  const selectedId = current?.exerciseId ?? sortedOptions[0]!.id;

  return (
    <section className={styles.card} aria-labelledby="evolucion">
      <div className={styles.headerRow}>
        <h2 className={styles.title} id="evolucion">
          Evolución
        </h2>
        <label className={styles.pickerLabel}>
          <span className={styles.pickerText}>Ejercicio</span>
          <select
            className={styles.picker}
            aria-label="Elegir Ejercicio para la evolución"
            value={selectedId}
            onChange={(event) => onSelectExercise(event.target.value)}
          >
            {sortedOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {current === null && (
        <div className={styles.absentCard}>
          <p>No hay analítica para este Ejercicio.</p>
        </div>
      )}

      {current !== null && current.metric === null && (
        <div className={styles.absentCard}>
          <p className={styles.absentTitle}>{current.name}</p>
          <p className={styles.absentText}>
            El cardio continuo no dispone de analítica en esta versión.
          </p>
        </div>
      )}

      {current !== null && current.metric !== null && current.points.length === 0 && (
        <div className={styles.absentCard}>
          <p>Todavía no hay datos para este Ejercicio.</p>
        </div>
      )}

      {current !== null && current.metric !== null && current.points.length > 0 && (
        <EvolutionChart
          name={current.name}
          metric={current.metric}
          points={current.points}
        />
      )}
    </section>
  );
}
