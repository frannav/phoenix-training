/**
 * Normaliza un texto para la búsqueda por nombre: minúsculas y sin acentos,
 * de modo que «flexion» encuentre «Flexión». Se calcula durante la carga
 * versionada y contra la consulta de búsqueda, nunca para traducir o inferir
 * contenido upstream.
 */
export function normalizeSearchText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}
