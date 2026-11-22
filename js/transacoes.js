/*
 * newCoin - pagina de transacoes (prototipo estatico).
 * Mostra o periodo atual, valida cada bloco e permite baixar comprovantes
 * e arquivos de periodos encerrados/invalidados.
 */
(function () {
    'use strict';

    const corpoTabela = document.getElementById('lista-transacoes');
    const listaArquivos = document.getElementById('lista-arquivos');
    const mensagemValidacao = document.getElementById('validacao');
    const mensagemAcoes = document.getElementById('status-acoes');
    const botaoEncerrar = document.getElementById('btn-encerrar');
    const botaoReiniciar = document.getElementById('btn-reiniciar');
    const campoMotivo = document.getElementById('motivo-encerramento');

    function mensagem(elemento, texto, tipo) {
        elemento.textContent = texto;
        elemento.className = 'status ' + (tipo || '');
    }

    function criarCelula(texto, classe) {
        const celula = document.createElement('td');
        celula.textContent = texto;
        if (classe) {
            celula.className = classe;
        }
        return celula;
    }

    function resumoHash(hash) {
        return hash && hash.length > 24 ? hash.slice(0, 12) + '…' + hash.slice(-8) : (hash || '—');
    }

    async function renderizarTransacoes(estado) {
        const chain = NewCoin.Chain.deJSON(estado.periodoAtual.chain);
        document.getElementById('periodo-id').textContent = estado.periodoAtual.id;
        document.getElementById('periodo-inicio').textContent = estado.periodoAtual.iniciadoEm;

        corpoTabela.textContent = '';
        for (let indice = 0; indice < chain.blocks.length; indice++) {
            const bloco = chain.blocks[indice];
            const transacao = bloco.transaction;
            const validacao = await bloco.validar();
            const linha = document.createElement('tr');

            linha.appendChild(criarCelula(String(indice)));
            linha.appendChild(criarCelula(transacao.timestamp, 'mono'));
            linha.appendChild(criarCelula(transacao.origem));
            linha.appendChild(criarCelula(transacao.destino));
            linha.appendChild(criarCelula(String(transacao.valor)));
            linha.appendChild(criarCelula(transacao.justificativa));
            linha.appendChild(criarCelula(resumoHash(transacao.hash), 'mono'));

            const situacao = criarCelula(
                validacao.valido ? 'Válido' : 'Inválido',
                validacao.valido ? 'situacao-ok' : 'situacao-erro'
            );
            if (!validacao.valido) {
                situacao.title = validacao.erros.join('; ');
            }
            linha.appendChild(situacao);

            const celulaAcao = document.createElement('td');
            if (transacao.id !== 'genesis') {
                const botaoDownload = document.createElement('button');
                botaoDownload.type = 'button';
                botaoDownload.className = 'pequeno';
                botaoDownload.textContent = 'Baixar';
                botaoDownload.addEventListener('click', async function () {
                    try {
                        const comprovante = await NewCoinStore.comprovante(bloco.toJSON());
                        NewCoinStore.baixarJSON('comprovante-' + transacao.id + '.json', comprovante);
                        mensagem(mensagemAcoes, 'Comprovante gerado: comprovante-' + transacao.id + '.json', 'ok');
                    } catch (erro) {
                        mensagem(mensagemAcoes, 'Falha: ' + erro.message, 'erro');
                    }
                });
                celulaAcao.appendChild(botaoDownload);
            } else {
                celulaAcao.textContent = '—';
            }
            linha.appendChild(celulaAcao);
            corpoTabela.appendChild(linha);
        }

        if (chain.blocks.length === 0) {
            const linha = document.createElement('tr');
            const celula = criarCelula('Nenhum bloco no periodo.');
            celula.colSpan = 9;
            linha.appendChild(celula);
            corpoTabela.appendChild(linha);
        }

        const validacao = await chain.validar();
        if (validacao.valido) {
            mensagem(mensagemValidacao, 'Corrente válida: hashes, assinaturas e encadeamento conferem.', 'ok');
        } else {
            mensagem(mensagemValidacao, 'Problemas encontrados: ' + validacao.erros.join(' | '), 'erro');
        }
    }

    function renderizarArquivos(estado) {
        listaArquivos.textContent = '';
        if (!estado.arquivos.length) {
            const vazio = document.createElement('p');
            vazio.className = 'vazio';
            vazio.textContent = 'Nenhum arquivo gerado ate agora.';
            listaArquivos.appendChild(vazio);
            return;
        }

        estado.arquivos.slice().reverse().forEach(function (arquivo) {
            const cartao = document.createElement('article');
            cartao.className = 'arquivo';

            const titulo = document.createElement('h3');
            titulo.textContent = 'Arquivo ' + arquivo.id;
            cartao.appendChild(titulo);

            const detalhes = document.createElement('dl');
            detalhes.className = 'detalhes';
            const pares = [
                ['Criado em (timestamp atual)', arquivo.criadoEm],
                ['Periodo arquivado', arquivo.periodoId],
                ['Inicio do periodo', arquivo.iniciadoEm],
                ['Encerrado em', arquivo.encerradoEm],
                ['Transacoes arquivadas', String(arquivo.quantidadeTransacoes)],
                ['Motivo', arquivo.motivo],
                ['Hash do periodo', arquivo.hashDoPeriodo],
                ['Hash do arquivo anterior', arquivo.hashDoArquivoAnterior]
            ];
            pares.forEach(function (par) {
                const termo = document.createElement('dt');
                termo.textContent = par[0];
                const descricao = document.createElement('dd');
                descricao.textContent = par[1];
                descricao.className = par[0].indexOf('Hash') === 0 ? 'mono quebrar' : '';
                detalhes.appendChild(termo);
                detalhes.appendChild(descricao);
            });
            cartao.appendChild(detalhes);

            const botao = document.createElement('button');
            botao.type = 'button';
            botao.className = 'pequeno';
            botao.textContent = 'Baixar arquivo JSON';
            botao.addEventListener('click', function () {
                NewCoinStore.baixarJSON('arquivo-' + arquivo.id + '.json', arquivo);
                mensagem(mensagemAcoes, 'Arquivo baixado: arquivo-' + arquivo.id + '.json', 'ok');
            });
            cartao.appendChild(botao);

            const lista = document.createElement('ul');
            (arquivo.periodosInvalidados || []).forEach(function (periodo) {
                const item = document.createElement('li');
                item.textContent = 'Periodo ' + periodo.periodoId + ' (' + periodo.iniciadoEm +
                    ') invalidado em ' + periodo.invalidadoEm + ' por ' + periodo.invalidadoPor;
                lista.appendChild(item);
            });
            if (lista.children.length) {
                cartao.appendChild(lista);
            }

            listaArquivos.appendChild(cartao);
        });
    }

    async function renderizar() {
        const estado = await NewCoinStore.estadoAtual();
        await renderizarTransacoes(estado);
        renderizarArquivos(estado);
    }

    botaoEncerrar.addEventListener('click', async function () {
        if (!window.confirm('Encerrar o periodo atual? As transacoes antigas serao arquivadas e invalidadas.')) {
            return;
        }
        botaoEncerrar.disabled = true;
        mensagem(mensagemAcoes, 'Gerando arquivo com timestamp atual...', 'info');
        try {
            const arquivo = await NewCoinStore.encerrarPeriodo(campoMotivo.value.trim());
            mensagem(mensagemAcoes, 'Periodo encerrado. Arquivo ' + arquivo.id + ' gerado em ' + arquivo.criadoEm + '.', 'ok');
            campoMotivo.value = '';
            await renderizar();
        } catch (erro) {
            mensagem(mensagemAcoes, 'Falha: ' + erro.message, 'erro');
        } finally {
            botaoEncerrar.disabled = false;
        }
    });

    botaoReiniciar.addEventListener('click', async function () {
        if (!window.confirm('Apagar transacoes, arquivos e carteira deste teste?')) {
            return;
        }
        botaoReiniciar.disabled = true;
        try {
            await NewCoinStore.reiniciar();
            mensagem(mensagemAcoes, 'Dados de teste reiniciados.', 'ok');
            await renderizar();
        } catch (erro) {
            mensagem(mensagemAcoes, 'Falha: ' + erro.message, 'erro');
        } finally {
            botaoReiniciar.disabled = false;
        }
    });

    renderizar().catch(function (erro) {
        mensagem(mensagemValidacao, 'Falha ao carregar: ' + erro.message, 'erro');
    });
})();
