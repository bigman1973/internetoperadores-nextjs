import assert from 'node:assert/strict';
import { extractPayrollReimbursements } from '../lib/nominas-parser';
import { projectPayrollSalary } from '../lib/salary-projection';

const header = 'LIQUIDO A PERCIBIR\nREM. TOTAL P.P.EXTRAS BASE I.R.P.F. T. DEVENGADO';
assert.equal(extractPayrollReimbursements(`${header}\n  300,00  0,260   301  -Kilometraje                  78,00\n    302  -Dietas y manutención          42,35`), 120.35);
assert.equal(extractPayrollReimbursements(`${header}\n  305 -Gastos Desplazamiento       17,42`), 17.42);
assert.equal(extractPayrollReimbursements(`${header}\n  100 -Salario base               1.500,00`), 0);
assert.equal(extractPayrollReimbursements(`${header}\n  307 -Dietas                12,00  19,00`), null);
assert.equal(extractPayrollReimbursements(`${header}\n  308 -Compensación gastos          13,00`), null);
assert.equal(extractPayrollReimbursements(`${header}\n  302 -Dietas                       -3,00`), null);
assert.equal(extractPayrollReimbursements('PDF sin bases ni cabecera'), null);
assert.deepEqual(projectPayrollSalary(2000, 120.35), {
  brutoMensualTrabajador: 1879.65,
  proyeccionDoceMeses: 22555.8,
  gastosExcluidos: 120.35,
});
assert.equal(projectPayrollSalary(2000, null), null);
assert.equal(projectPayrollSalary(2000, 2000), null);
assert.equal(projectPayrollSalary(2000, -1), null);
console.log('Proyección salarial: reintegros verificables, céntimos y ambigüedades protegidos.');
