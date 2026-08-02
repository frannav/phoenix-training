export type VerificationEmail = {
  to: string;
  url: string;
};

/**
 * Adaptador de correo transaccional. El dominio entrega la dirección y el
 * enlace ya construido; el proveedor concreto se elige durante el despliegue.
 * Los tests sustituyen este adaptador por uno controlable que observa envíos.
 */
export type MailAdapter = {
  sendVerificationEmail: (email: VerificationEmail) => Promise<void>;
};
