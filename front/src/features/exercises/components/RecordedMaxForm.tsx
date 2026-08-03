import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { ApiRequestError } from "../../../shared/http/api-client";
import { FormField } from "../../../shared/ui/FormField";
import type { RecordedMax, RecordedMaxFormValues } from "../api/exercises-api";
import styles from "./RecordedMaxForm.module.css";

/** Fecha de dominio YYYY-MM-DD que corresponde a un día real del calendario. */
function isDomainDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day!));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month! - 1 &&
    date.getUTCDate() === day
  );
}

const recordedMaxFormSchema = z.object({
  exerciseId: z.string().trim().min(1, "Elige un Ejercicio."),
  load: z
    .number({ message: "Indica la carga en kilogramos." })
    .min(0, "La carga no puede ser negativa.")
    .max(9999.99, "La carga no puede superar los 9999,99 kg.")
    .refine(
      (value) => Math.abs(Math.round(value * 100) - value * 100) < 1e-6,
      "La carga admite como máximo dos decimales.",
    ),
  repetitions: z
    .number({ message: "Indica el número de repeticiones." })
    .int("Las repeticiones deben ser un número entero.")
    .min(1, "Las repeticiones deben ser al menos 1.")
    .max(9999, "Las repeticiones no pueden superar 9999."),
  date: z
    .string({ message: "Indica la fecha del RM." })
    .min(1, "Indica la fecha del RM.")
    .regex(/^\d{4}-\d{2}-\d{2}$/, "La fecha debe tener el formato AAAA-MM-DD.")
    .refine(isDomainDate, "La fecha no es un día válido."),
});

export type ExerciseOption = { id: string; name: string };

type RecordedMaxFormProps = {
  rm: RecordedMax | null;
  exerciseOptions: ExerciseOption[];
  submitLabel: string;
  onCancel: () => void;
  onSubmit: (values: RecordedMaxFormValues) => Promise<void>;
};

export function RecordedMaxForm({
  rm,
  exerciseOptions,
  submitLabel,
  onCancel,
  onSubmit,
}: RecordedMaxFormProps) {
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<RecordedMaxFormValues>({
    resolver: zodResolver(recordedMaxFormSchema),
    defaultValues: {
      exerciseId: rm?.exerciseId ?? "",
      // Los campos numéricos usan valueAsNumber: el valor vacío se convierte
      // en NaN y el esquema lo rechaza con un mensaje explícito por campo.
      load: rm?.load,
      repetitions: rm?.repetitions,
      date: rm?.date ?? "",
    },
  });

  const isEdit = rm !== null;
  const fieldPrefix = isEdit ? `rm-${rm.id}` : "rm-nueva";

  const handleSubmitForm = handleSubmit(async (values) => {
    setServerError(null);
    try {
      await onSubmit(values);
    } catch (error) {
      if (error instanceof ApiRequestError) {
        if (error.fields) {
          for (const [field, messages] of Object.entries(error.fields)) {
            if (field in values) {
              setError(field as keyof RecordedMaxFormValues, {
                message: messages[0],
              });
            }
          }
        }
        setServerError(error.message);
      } else {
        setServerError("No se pudo guardar el RM. Inténtalo de nuevo.");
      }
    }
  });

  return (
    <form className={styles.form} onSubmit={handleSubmitForm} noValidate>
      <FormField
        label="Ejercicio"
        htmlFor={`${fieldPrefix}-ejercicio`}
        error={errors.exerciseId?.message}
      >
        <select
          id={`${fieldPrefix}-ejercicio`}
          className={styles.input}
          disabled={isEdit}
          aria-describedby={
            isEdit
              ? `${fieldPrefix}-ejercicio-ayuda`
              : errors.exerciseId
                ? `${fieldPrefix}-ejercicio-error`
                : undefined
          }
          {...register("exerciseId")}
        >
          <option value="">Elige un Ejercicio…</option>
          {exerciseOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name}
            </option>
          ))}
        </select>
        {isEdit && (
          <p id={`${fieldPrefix}-ejercicio-ayuda`} className={styles.help}>
            El Ejercicio de un RM no puede cambiar: la marca pertenece al
            Ejercicio para el que se registró.
          </p>
        )}
      </FormField>

      <div className={styles.row}>
        <FormField
          label="Carga (kg)"
          htmlFor={`${fieldPrefix}-carga`}
          error={errors.load?.message}
        >
          <input
            id={`${fieldPrefix}-carga`}
            className={styles.input}
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            max="9999.99"
            autoComplete="off"
            aria-invalid={errors.load ? true : undefined}
            aria-describedby={errors.load ? `${fieldPrefix}-carga-error` : undefined}
            {...register("load", { valueAsNumber: true })}
          />
        </FormField>

        <FormField
          label="Repeticiones"
          htmlFor={`${fieldPrefix}-repeticiones`}
          error={errors.repetitions?.message}
        >
          <input
            id={`${fieldPrefix}-repeticiones`}
            className={styles.input}
            type="number"
            inputMode="numeric"
            step="1"
            min="1"
            max="9999"
            autoComplete="off"
            aria-invalid={errors.repetitions ? true : undefined}
            aria-describedby={
              errors.repetitions ? `${fieldPrefix}-repeticiones-error` : undefined
            }
            {...register("repetitions", { valueAsNumber: true })}
          />
        </FormField>
      </div>

      <FormField
        label="Fecha"
        htmlFor={`${fieldPrefix}-fecha`}
        error={errors.date?.message}
      >
        <input
          id={`${fieldPrefix}-fecha`}
          className={styles.input}
          type="date"
          autoComplete="off"
          aria-invalid={errors.date ? true : undefined}
          aria-describedby={errors.date ? `${fieldPrefix}-fecha-error` : undefined}
          {...register("date")}
        />
      </FormField>

      {serverError && (
        <p className={styles.formError} role="alert">
          <span aria-hidden="true">⚠</span>
          {serverError}
        </p>
      )}

      <div className={styles.actions}>
        <button className={styles.submit} type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Guardando…" : submitLabel}
        </button>
        <button className={styles.cancel} type="button" onClick={onCancel} disabled={isSubmitting}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
