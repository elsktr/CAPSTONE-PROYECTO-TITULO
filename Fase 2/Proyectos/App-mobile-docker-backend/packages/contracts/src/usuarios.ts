export type Rol = 'CLIENTE' | 'VENDEDOR' | 'BODEGA' | 'GERENTE' | 'RRHH';

export interface Usuario {
  id: number;
  nombre: string;
  email: string;
  rol: Rol;
}

/** POST /usuarios/auth/login */
export interface LoginRequest {
  email: string;
  password: string;
}

/** Respuesta de login y de refresh. */
export interface SesionResponse {
  accessToken: string;
  refreshToken: string;
  usuario: Usuario;
}

/** POST /usuarios/auth/refresh y /logout */
export interface RefreshRequest {
  refreshToken: string;
}

/**
 * POST /usuarios/auth/registro (público)
 *
 * Crea una cuenta de Cliente y responde su sesión ya iniciada. La contraseña debe tener
 * al menos 8 caracteres. Un correo ya registrado responde `409 EMAIL_EN_USO`.
 */
export interface RegistroRequest {
  nombre: string;
  email: string;
  password: string;
}

/** Cuenta del personal. GET /usuarios/internos (Gerente, RRHH) */
export interface CuentaInterna extends Usuario {
  activo: boolean;
}

/** Datos de la cuenta de quien consulta. GET /usuarios/yo (cualquier sesión) */
export interface PerfilUsuario extends Usuario {
  /** Cuándo se creó la cuenta. */
  creadoEn: string;
}
