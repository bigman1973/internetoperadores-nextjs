import urllib.request
import json

url = "http://localhost:3000/api/admin/desarrollo-historial"
data = {
    "titulo": "Gestión documental y económica en Proyectos Singulares",
    "descripcion": "Se ha ampliado el modelo de Proyectos Singulares para incluir importeVenta, costeProveedores, margenEstimado y documentosJson. Se ha actualizado la interfaz para permitir subir PDFs (presupuestos, pedidos, albaranes) y calcular márgenes automáticamente.",
    "tipo": "feat",
    "estado": "completado",
    "impacto": "Mejora la trazabilidad de los proyectos singulares de Draxton, permitiendo adjuntar documentación y calcular márgenes reales vs estimados.",
    "autor": "Manus AI"
}

req = urllib.request.Request(url, data=json.dumps(data).encode('utf-8'), headers={'Content-Type': 'application/json'})
try:
    with urllib.request.urlopen(req) as response:
        print("Desarrollo registrado:", response.read().decode())
except Exception as e:
    print("Error registrando desarrollo:", e)
