import assert from 'node:assert/strict';
import {
  loadPermisosUsuarioModal,
  loadPerfilEditorModal,
  loadUsuarioEditorModal,
} from '../components/admin/UsuariosModalLoaders';

async function main() {
  const modules = await Promise.all([
    loadPermisosUsuarioModal(),
    loadUsuarioEditorModal(),
    loadPerfilEditorModal(),
  ]);

  for (const module of modules) {
    assert.equal(typeof module.default, 'function');
  }

  console.log('usuarios modal loaders synthetic test: ok');
}

void main();
