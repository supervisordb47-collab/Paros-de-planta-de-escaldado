# Portal Secadas Portable

Sistema portable para secadas con:
- login por usuario y contraseña
- dashboard ejecutivo
- notificaciones estilo campana
- registros por turno y secadora
- edición y eliminación por administrador
- gráficos locales sin dependencias externas
- sincronización opcional con GitHub como nube
- botón de WhatsApp para compartir avisos
- exportación e importación JSON
- exportación CSV

## Acceso inicial
- Usuario: `admin`
- Contraseña: `admin123`

## Uso
1. Descomprime el ZIP.
2. Abre `index.html` en un hosting estático o servidor local.
3. Inicia sesión.
4. Crea usuarios, registra secadas y administra notificaciones.

## Portabilidad
El sistema puede trabajar con sincronización en GitHub para conservar los datos fuera del navegador y también admite respaldo JSON como copia extra. El token de GitHub se captura solo en la sesión actual.

## Mejoras previstas
- Reforzar la autenticación con hash real y reglas de acceso más estrictas.
- Validación extra al importar datos y al mover respaldos entre equipos.
- Registro de auditoría más detallado para edición y eliminación.
- Automatizar alertas y notificaciones por más canales operativos.
- Mejorar la administración del token de GitHub para entornos compartidos.

## GitHub Pages
1. Sube estos archivos al repositorio.
2. Activa GitHub Pages desde Settings > Pages.
3. Publica desde la rama main y la raíz del repo.
4. Abre la URL pública de GitHub Pages.
