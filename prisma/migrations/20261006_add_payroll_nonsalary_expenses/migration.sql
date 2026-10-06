-- Los reintegros de gastos del PDF individual no forman parte del salario proyectado.
-- NULL indica que el justificante todavía no se ha cotejado; 0, que no hay reintegros.
ALTER TABLE "nominas" ADD COLUMN "gastos_no_salariales" DOUBLE PRECISION;
