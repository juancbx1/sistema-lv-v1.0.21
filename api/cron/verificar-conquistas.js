// api/cron/verificar-conquistas.js (VERSÃO FINAL E CORRIGIDA)
import 'dotenv/config';
import pkg from 'pg';
const { Pool } = pkg;
// Importamos TODOS os ciclos, não apenas a função que pega o ciclo atual
import { ciclos } from '../../public/js/utils/ciclos.js'; 

const pool = new Pool({
    connectionString: process.env.POSTGRES_URL,
});

/**
 * Função auxiliar que encontra um ciclo que terminou exatamente ontem.
 * @returns {object|null} O objeto do ciclo que terminou ontem, ou null se nenhum terminou.
 */
function findCicloQueTerminouOntem() {
    const ontem = new Date();
    ontem.setDate(ontem.getDate() - 1);
    const ontemString = ontem.toISOString().split('T')[0]; // Formato 'YYYY-MM-DD'

    for (const ciclo of ciclos) {
        if (!ciclo.semanas || ciclo.semanas.length === 0) continue;
        
        // Pega a data final da última semana do ciclo
        const dataFimCiclo = ciclo.semanas[ciclo.semanas.length - 1].fim;
        
        if (dataFimCiclo === ontemString) {
            console.log(`[CRON] Ciclo "${ciclo.nome}" terminou ontem (${ontemString}). Iniciando auditoria de desempenho.`);
            return ciclo;
        }
    }

    console.log('[CRON] Nenhum ciclo terminou ontem. Pulando auditoria de desempenho.');
    return null;
}


export default async function handler(request, response) {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return response.status(401).json({ error: 'Acesso não autorizado.' });
    }

    let dbClient;
    try {
        console.log('[CRON] Iniciando verificação de conquistas...');
        dbClient = await pool.connect();
        
        // --- 1. VERIFICAÇÃO DE DESEMPENHO (APENAS SE UM CICLO FECHOU) ---
        const cicloParaAuditar = findCicloQueTerminouOntem();
        
        if (cicloParaAuditar) {
            // Pega as datas de início e fim do ciclo auditado
            const inicioCicloAuditado = cicloParaAuditar.semanas[0].inicio;
            const fimCicloAuditado = cicloParaAuditar.semanas[cicloParaAuditar.semanas.length - 1].fim;
            
            // Busca todos os usuários de uma vez para otimizar
            const usuariosResult = await dbClient.query('SELECT id, nome FROM usuarios WHERE tipos @> ARRAY[\'costureira\'] OR tipos @> ARRAY[\'tiktik\']');
            const todosUsuarios = usuariosResult.rows;

            for (const usuario of todosUsuarios) {
                // Para cada usuário, busca suas conquistas atuais
                const conquistasAtuaisResult = await dbClient.query('SELECT id_conquista FROM usuario_conquistas WHERE id_usuario = $1', [usuario.id]);
                const conquistasAtuais = new Set(conquistasAtuaisResult.rows.map(r => r.id_conquista));
                
                const concederConquista = async (idConquista) => {
                    if (!conquistasAtuais.has(idConquista)) {
                        await dbClient.query(
                            'INSERT INTO usuario_conquistas (id_usuario, id_conquista) VALUES ($1, $2) ON CONFLICT DO NOTHING',
                            [usuario.id, idConquista]
                        );
                        console.log(`[CRON] Conquista de desempenho '${idConquista}' concedida para ${usuario.nome} referente ao ciclo ${cicloParaAuditar.nome}`);
                    }
                };

                // Query para somar todos os pontos do usuário no ciclo que fechou
                const pontosCicloQuery = `
                    SELECT SUM(pontos_gerados) as total_pontos FROM (
                        SELECT pontos_gerados FROM producoes WHERE funcionario = $1 AND data BETWEEN $2 AND $3
                        UNION ALL
                        SELECT pontos_gerados FROM arremates WHERE usuario_tiktik = $1 AND data_lancamento BETWEEN $2 AND $3
                    ) as pontos_totais;
                `;
                const pontosCicloResult = await dbClient.query(pontosCicloQuery, [usuario.nome, inicioCicloAuditado, fimCicloAuditado]);
                const totalPontosCiclo = parseFloat(pontosCicloResult.rows[0].total_pontos) || 0;

                // Verificações de conquistas de desempenho
                if (totalPontosCiclo >= 16000) await concederConquista('pontos_ciclo_16k');
                // Adicione outras conquistas de desempenho aqui (ex: 'maratonista_platina')
            }
        }

        // --- 2. VERIFICAÇÕES DIÁRIAS (CONTINUAM COMO ANTES) ---
        console.log('[CRON] Iniciando verificações diárias (ex: tempo de casa)...');
        const usuariosParaChecksDiarios = await dbClient.query('SELECT id, nome, data_admissao FROM usuarios WHERE tipos @> ARRAY[\'costureira\'] OR tipos @> ARRAY[\'tiktik\']');
        
        for (const usuario of usuariosParaChecksDiarios.rows) {
            const conquistasAtuaisResult = await dbClient.query('SELECT id_conquista FROM usuario_conquistas WHERE id_usuario = $1', [usuario.id]);
            const conquistasAtuais = new Set(conquistasAtuaisResult.rows.map(r => r.id_conquista));

            const concederConquistaDiaria = async (idConquista) => {
                if (!conquistasAtuais.has(idConquista)) {
                    await dbClient.query('INSERT INTO usuario_conquistas (id_usuario, id_conquista) VALUES ($1, $2) ON CONFLICT DO NOTHING', [usuario.id, idConquista]);
                    console.log(`[CRON] Conquista diária '${idConquista}' concedida para ${usuario.nome}`);
                }
            };
            
            // Verificação de "Veterano 1 Ano"
            if (usuario.data_admissao) {
                const umAnoAtras = new Date();
                umAnoAtras.setFullYear(umAnoAtras.getFullYear() - 1);
                if (new Date(usuario.data_admissao) <= umAnoAtras) {
                    await concederConquistaDiaria('veterano_1a');
                }
            }
            // Adicione outras verificações diárias aqui...
        }

        console.log('[CRON] Verificação de conquistas concluída com sucesso.');
        return response.status(200).json({ status: 'sucesso' });

    } catch (error) {
        console.error('[CRON] Erro durante a execução:', error);
        return response.status(500).json({ error: error.message || 'Erro interno no processo do Cron Job.' });
    } finally {
        if (dbClient) dbClient.release();
    }
}