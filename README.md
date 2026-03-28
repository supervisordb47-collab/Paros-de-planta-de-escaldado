# Portal Secadas Portable

Sistema web para control de secadas y paros de planta con:
- login por usuario y contraseña
- dashboard ejecutivo
- notificaciones estilo campana
- registros por turno y secadora
- edición y eliminación por administrador
- gráficos locales sin dependencias externas
- exportación e importación JSON
- importación para combinar históricos
- exportación CSV
- sincronización con GitHub como nube compartida
- botón de WhatsApp configurable

## Acceso inicial
- Usuario: `admin`
- Contraseña: `admin123`

## Uso
1. Descomprime el ZIP.
2. Sube los archivos a GitHub Pages.
3. Abre la URL pública del portal.
4. Inicia sesión.
5. En Configuración llena GitHub, guarda el token de la sesión y sincroniza.

## Sincronización con GitHub
- El portal intenta detectar automáticamente el owner y repo desde la URL de GitHub Pages.
- El archivo recomendado es `portal-data.json`.
- El token de GitHub se guarda solo en la sesión del navegador.
- Cada dispositivo necesita cargar su propio token una vez para poder guardar.

## Portabilidad
Los datos principales viven en GitHub, no en localStorage.  
Eso permite que distintos dispositivos vean la misma base si abren el mismo portal y sincronizan.

## GitHub Pages
1. Sube estos archivos al repositorio.
2. Activa GitHub Pages desde Settings > Pages.
3. Publica desde la rama main y la raíz del repo.
4. Abre la URL pública de GitHub Pages.
