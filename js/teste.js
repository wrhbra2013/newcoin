/*
 * newCoin - autoteste estatico (executado no navegador).
 */
(function () {
    'use strict';

    const botao = document.getElementById('btn-teste');
    const resultados = document.getElementById('resultados');

    function etapa(descricao, ok, detalhe) {
        const item = document.createElement('li');
        item.className = ok ? 'situacao-ok' : 'situacao-erro';
        item.textContent = (ok ? 'OK - ' : 'FALHA - ') + descricao +
            (detalhe ? ' :: ' + detalhe : '');
        resultados.appendChild(item);
    }

    async function executar() {
        resultados.textContent = '';
        try {
            await NewCoinStore.reiniciar();
            etapa('Estado de teste recriado', true);

            const bloco = await NewCoinStore.registrarTransacao({
                origem: 'Cleusa',
                destino: 'Wander',
                valor: 100,
                justificativa: 'Pagamento de consultoria (lastro da transacao)'
            });
            etapa('Hash automatico gerado para a nova transacao',
                /^[a-f0-9]{64}$/.test(bloco.transaction.hash), bloco.transaction.hash);

            const estado = await NewCoinStore.estadoAtual();
            const validacao = await NewCoin.Chain.deJSON(estado.periodoAtual.chain).validar();
            etapa('Corrente valida (hash, assinatura e encadeamento)',
                validacao.valido, validacao.erros.join('; ') || 'tudo conferiu');

            const adulterada = JSON.parse(JSON.stringify(bloco));
            adulterada.transaction.justificativa = 'justificativa adulterada';
            const validacaoAdulterada = await NewCoin.Block.deJSON(adulterada).validar();
            etapa('Adulteracao da justificativa detectada',
                !validacaoAdulterada.valido, validacaoAdulterada.erros.join('; '));

            const periodoAntes = estado.periodoAtual.id;
            const arquivo = await NewCoinStore.encerrarPeriodo('autoteste');
            const estadoDepois = await NewCoinStore.estadoAtual();
            etapa('Arquivo gerado com timestamp atual',
                Boolean(arquivo.criadoEm) && arquivo.periodosInvalidados.length === 1, arquivo.criadoEm);
            etapa('Hash do periodo gerado como lastro',
                /^[a-f0-9]{64}$/.test(arquivo.hashDoPeriodo), arquivo.hashDoPeriodo);
            etapa('Periodo antigo invalidado e novo periodo iniciado',
                arquivo.periodo.invalidado === true && periodoAntes !== estadoDepois.periodoAtual.id,
                periodoAntes + ' -> ' + estadoDepois.periodoAtual.id);
            etapa('Historico antigo preservado no arquivo',
                arquivo.periodo.chain.blocks.length === 2,
                'blocos arquivados: ' + arquivo.periodo.chain.blocks.length);

            // Notas de valor P2P offline
            NewCoinNotasStore.reiniciar();
            const nota = await NewCoinNotasStore.emitir({
                valor: 100, moeda: 'NC', dias: 30,
                portador: 'Wander', justificativa: 'Lastro de teste'
            });
            etapa('Nota de valor emitida com hash automatico',
                /^[a-f0-9]{64}$/.test(nota.hash), nota.hash);
            const validacaoNota = await NewCoinNotasStore.validarNota(nota);
            etapa('Nota valida offline (hash, assinatura e validade)',
                validacaoNota.valido, validacaoNota.erros.join('; ') || 'tudo conferiu');

            const adulterada = JSON.parse(JSON.stringify(nota));
            adulterada.justificativa = 'justificativa adulterada';
            const validacaoAdulterada = await NewCoinNotasStore.validarNota(adulterada);
            etapa('Adulteracao da nota detectada',
                !validacaoAdulterada.valido, validacaoAdulterada.erros.join('; '));

            const arquivoExclusao = await NewCoinNotasStore.excluir({ id: nota.id, motivo: 'teste' });
            const validacaoExcluida = await NewCoinNotasStore.validarNota(nota);
            etapa('Exclusao por timestamp posterior',
                !validacaoExcluida.valido && Date.parse(arquivoExclusao.criadoEm) > Date.parse(nota.criadoEm),
                arquivoExclusao.criadoEm);

            const nota2 = await NewCoinNotasStore.emitir({
                valor: 50, moeda: 'NC', dias: 30,
                portador: 'Cleusa', justificativa: 'Segunda nota'
            });
            NewCoinNotasStore.reiniciar();
            const importada = await NewCoinNotasStore.importar(nota2);
            const validacaoImportada = await NewCoinNotasStore.validarNota(importada.nota);
            etapa('Nota exportada e importada em carteira limpa',
                importada.tipo === 'nota' && validacaoImportada.valido, importada.mensagem);

            // Replay: uma nota com sequencia menor que a ultima conhecida deve ser rejeitada.
            const replay = NewCoinNotas.NotaValor.deJSON(JSON.parse(JSON.stringify(nota)));
            replay.id = 'ncv-replay-' + Date.now();
            replay.sequencia = nota2.sequencia - 1;
            replay.estado = { situacao: 'ativa' };
            replay.hash = await replay.calcularHash();
            await replay.assinar(await NewCoinStore.carteira());
            let replayRejeitado = false;
            try {
                await NewCoinNotasStore.importar(replay.toJSON());
            } catch (erro) {
                replayRejeitado = true;
            }
            etapa('Replay de sequencia monotônica rejeitado', replayRejeitado);
        } catch (erro) {
            etapa('Erro inesperado', false, erro.message);
        } finally {
            botao.disabled = false;
        }
    }

    botao.addEventListener('click', function () {
        botao.disabled = true;
        executar();
    });
})();
