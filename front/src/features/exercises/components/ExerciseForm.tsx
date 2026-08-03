import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { ApiRequestError } from "../../../shared/http/api-client";
import { FormField } from "../../../shared/ui/FormField";
import {
  recordingModeLabels,
  type ExerciseFormValues,
  type ExerciseItem,
  type RecordingMode,
} from "../api/exercises-api";
import styles from "./ExerciseForm.module.css";

const exerciseFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Escribe un nombre para el Ejercicio.")
    .max(80, "El nombre no puede superar los 80 caracteres."),
  instructions: z
    .string()
    .trim()
    .min(1, "Escribe las instrucciones del Ejercicio.")
    .max(2000, "Las instrucciones no pueden superar los 2000 caracteres."),
  recordingMode: z.enum(
    ["fuerza_con_carga", "repeticiones_sin_carga", "tiempo_por_serie", "cardio_continuo"],
    { message: "Elige una Forma de registro." },
  ),
  category: z
    .string()
    .trim()
    .min(1, "Elige una categoría.")
    .max(50, "La categoría no puede superar los 50 caracteres."),
  bodyPart: z.string().trim().max(50, "La parte del cuerpo no puede superar los 50 caracteres."),
  equipment: z.string().trim().max(50, "El equipamiento no puede superar los 50 caracteres."),
});

const recordingModes = Object.keys(recordingModeLabels) as RecordingMode[];

type ExerciseFormProps = {
  exercise: ExerciseItem | null;
  categories: string[];
  submitLabel: string;
  onCancel: () => void;
  onSubmit: (values: ExerciseFormValues) => Promise<void>;
};

export function ExerciseForm({
  exercise,
  categories,
  submitLabel,
  onCancel,
  onSubmit,
}: ExerciseFormProps) {
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ExerciseFormValues>({
    resolver: zodResolver(exerciseFormSchema),
    defaultValues: {
      name: exercise?.name ?? "",
      instructions: exercise?.instructions ?? "",
      recordingMode: exercise?.recordingMode ?? "fuerza_con_carga",
      category: exercise?.category ?? "",
      bodyPart: exercise?.bodyPart ?? "",
      equipment: exercise?.equipment ?? "",
    },
  });

  const isEdit = exercise !== null;
  const fieldPrefix = isEdit ? `ejercicio-${exercise.id}` : "ejercicio-nueva";

  const handleSubmitForm = handleSubmit(async (values) => {
    setServerError(null);
    try {
      await onSubmit(values);
    } catch (error) {
      if (error instanceof ApiRequestError) {
        if (error.fields) {
          for (const [field, messages] of Object.entries(error.fields)) {
            if (field in values) {
              setError(field as keyof ExerciseFormValues, { message: messages[0] });
            }
          }
        }
        setServerError(error.message);
      } else {
        setServerError("No se pudo guardar el Ejercicio. Inténtalo de nuevo.");
      }
    }
  });

  return (
    <form className={styles.form} onSubmit={handleSubmitForm} noValidate>
      <FormField
        label="Nombre"
        htmlFor={`${fieldPrefix}-nombre`}
        error={errors.name?.message}
      >
        <input
          id={`${fieldPrefix}-nombre`}
          className={styles.input}
          type="text"
          autoComplete="off"
          aria-invalid={errors.name ? true : undefined}
          aria-describedby={errors.name ? `${fieldPrefix}-nombre-error` : undefined}
          {...register("name")}
        />
      </FormField>

      <FormField
        label="Instrucciones"
        htmlFor={`${fieldPrefix}-instrucciones`}
        error={errors.instructions?.message}
      >
        <textarea
          id={`${fieldPrefix}-instrucciones`}
          className={styles.textarea}
          rows={4}
          aria-invalid={errors.instructions ? true : undefined}
          aria-describedby={
            errors.instructions ? `${fieldPrefix}-instrucciones-error` : undefined
          }
          {...register("instructions")}
        />
      </FormField>

      <FormField
        label="Forma de registro"
        htmlFor={`${fieldPrefix}-forma`}
        error={errors.recordingMode?.message}
      >
        <select
          id={`${fieldPrefix}-forma`}
          className={styles.input}
          disabled={isEdit}
          aria-describedby={
            isEdit ? `${fieldPrefix}-forma-ayuda` : errors.recordingMode ? `${fieldPrefix}-forma-error` : undefined
          }
          {...register("recordingMode")}
        >
          {recordingModes.map((mode) => (
            <option key={mode} value={mode}>
              {recordingModeLabels[mode]}
            </option>
          ))}
        </select>
        {isEdit && (
          <p id={`${fieldPrefix}-forma-ayuda`} className={styles.help}>
            La Forma de registro no puede cambiar después de publicar o utilizar un
            Ejercicio. Para otra Forma, crea un Ejercicio nuevo.
          </p>
        )}
      </FormField>

      <FormField
        label="Categoría"
        htmlFor={`${fieldPrefix}-categoria`}
        error={errors.category?.message}
      >
        <input
          id={`${fieldPrefix}-categoria`}
          className={styles.input}
          type="text"
          list="ejercicios-categorias"
          autoComplete="off"
          aria-invalid={errors.category ? true : undefined}
          aria-describedby={errors.category ? `${fieldPrefix}-categoria-error` : undefined}
          {...register("category")}
        />
        <datalist id="ejercicios-categorias">
          {categories.map((category) => (
            <option key={category} value={category} />
          ))}
        </datalist>
      </FormField>

      <div className={styles.row}>
        <FormField
          label="Parte del cuerpo"
          htmlFor={`${fieldPrefix}-cuerpo`}
          error={errors.bodyPart?.message}
        >
          <input
            id={`${fieldPrefix}-cuerpo`}
            className={styles.input}
            type="text"
            autoComplete="off"
            aria-invalid={errors.bodyPart ? true : undefined}
            aria-describedby={errors.bodyPart ? `${fieldPrefix}-cuerpo-error` : undefined}
            {...register("bodyPart")}
          />
        </FormField>

        <FormField
          label="Equipamiento"
          htmlFor={`${fieldPrefix}-equipo`}
          error={errors.equipment?.message}
        >
          <input
            id={`${fieldPrefix}-equipo`}
            className={styles.input}
            type="text"
            autoComplete="off"
            aria-invalid={errors.equipment ? true : undefined}
            aria-describedby={errors.equipment ? `${fieldPrefix}-equipo-error` : undefined}
            {...register("equipment")}
          />
        </FormField>
      </div>

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
