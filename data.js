// Datos iniciales del sistema portable.
const PORTAL_DEFAULT_DATA = {
  settings: {
    portalName: 'Portal Secadas',
    portalTagline: 'Operación, turnos y trazabilidad',
    dailyTarget: 6,
    monthlyTarget: 180,
    alertHours: 12,
    totalDryers: 3,
    theme: 'blue',
    whatsappNumber: '',
    whatsappMessage: 'Hola, te comparto el portal de secadas.',
    github: {
      owner: '',
      repo: '',
      branch: 'main',
      path: 'portal-data.json'
    }
  },
  users: {
    ADMIN: {
      username: 'ADMIN',
      fullName: 'Administrador',
      password: 'admin123',
      role: 'admin',
      active: true
    },
    SELVIN: {
      username: 'SELVIN',
      fullName: 'Selvin Ariel Reaños Figueroa',
      password: 'figueroa',
      role: 'operador',
      active: true
    },
    GADIEL: {
      username: 'GADIEL',
      fullName: 'Gadiel',
      password: 'gadiel',
      role: 'operador',
      active: true
    },
    JOSE: {
      username: 'JOSE',
      fullName: 'Jose',
      password: 'jose',
      role: 'operador',
      active: true
    }
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
