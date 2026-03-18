#!/usr/bin/env python3
"""
Script de configuración inicial para NotebookLM.
Ejecuta el login interactivo que abre el navegador y guarda las credenciales de forma persistente.
Solo necesitas ejecutar esto una vez.
"""

import asyncio
import sys
from pathlib import Path

async def main():
    print("=" * 60)
    print("  PASK STOCKS - Configuración de NotebookLM")
    print("=" * 60)
    print()
    print("Este script abrirá tu navegador para que inicies sesión en NotebookLM.")
    print("Las credenciales se guardarán de forma segura y persistente.")
    print()
    input("Presiona ENTER para continuar...")
    print()
    
    try:
        from notebooklm import NotebookLMClient
        
        # Usar el storage por defecto de la librería
        print("Iniciando autenticación...")
        print("Se abrirá una ventana del navegador. Por favor:")
        print("  1. Inicia sesión en tu cuenta de Google")
        print("  2. Cierra la ventana del navegador cuando veas la página de NotebookLM")
        print()
        
        # Esto abre el navegador y guarda las cookies persistentemente
        client = await NotebookLMClient.from_storage()
        async with client:
            # Verificar que funciona listando los notebooks
            notebooks = await client.notebooks.list()
            print(f"✓ Autenticación exitosa!")
            print(f"✓ Encontrados {len(notebooks)} cuaderno(s) en tu cuenta")
            print()
            
            # Buscar o crear el notebook PASK stocks
            pask_notebook = next((nb for nb in notebooks if nb.title == "PASK stocks"), None)
            if pask_notebook:
                print(f"✓ Notebook 'PASK stocks' encontrado (ID: {pask_notebook.id})")
            else:
                print("ℹ Notebook 'PASK stocks' no encontrado.")
                crear = input("¿Quieres crear el notebook 'PASK stocks' ahora? (s/n): ").lower()
                if crear == 's':
                    new_nb = await client.notebooks.create("PASK stocks")
                    print(f"✓ Notebook 'PASK stocks' creado (ID: {new_nb.id})")
        
        print()
        print("=" * 60)
        print("  ✓ Configuración completada exitosamente")
        print("=" * 60)
        print()
        print("Ahora puedes ejecutar la aplicación con: npm run electron")
        print()
        
    except Exception as e:
        print()
        print("✗ Error durante la configuración:")
        print(f"  {e}")
        print()
        print("Asegúrate de tener instalada la librería:")
        print("  pip install notebooklm-py[browser]")
        sys.exit(1)

if __name__ == "__main__":
    asyncio.run(main())
