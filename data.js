// Datos iniciales del sistema portable.
const PORTAL_DEFAULT_DATA = {
  settings: {
    portalName: 'Portal Secadas',
    portalTagline: 'Operación, turnos y trazabilidad',
    dailyTarget: 6,
    monthlyTarget: 180,
    alertHours: 12,
    theme: 'blue'
  },
  users: {
    Admin: { username: 'ADMIN', fullName: 'Administrador', password: 'admin123', role: 'admin', active: true },
    Selvin: { username: 'Selvin', fullName: 'Selvin Ariel Reaños Figueroa', password: 'figueroa', role: 'Operador', active: true }
  },
  records: [],
  notifications: [],
  meta: {
    notificationState: {
      DAY: null,
      NIGHT: null
    }
  }
};
