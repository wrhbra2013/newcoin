/*
 * newCoin - interface das notas de valor (pagina notas.html).
 */
(function () {
    'use strict';

    const form = document.getElementById('form-nota');
    const campoValor = document.getElementById('valor-nota');
    const campoMoeda = document.getElementById('moeda-nota');
    const campoDias = document.getElementById('dias-nota');
    const campoPortador = document.getElementById('portador-nota');
    const campoJustificativa = document.getElementById('justificativa-nota');
    const statusEmissao = document.getElementById('status-emissao');
    const statusImportacao = document.getElementById('status-importacao');
    const inputArquivo = document.getElementById('arquivo-importar');
    const campoJson = document.getElementById('json-importar');
    const botaoImportar = document.getElementById('btn-importar');
    const listaNotas = document.getElementById('lista-notas');
    const listaExclusoes = document.getElementById('lista-exclusoes');

    function mensagem(elemento, texto, tipo) {
        elemento.textContent = texto;
        elemento.className = 'status ' + (tipo || '');
    }

    function resumo(texto, tamanho) {
        if (!texto) {
            return '—';
        }
        return texto.length > tamanho ? texto.slice(0, tamanho) + '…' : texto;
    }

    function criarBotao(texto, classe, acao) {
        const botao = document.createElement('button');
        botao.type = 'button';
        botao.className = classe;
        botao.textContent = texto;
        botao.addEventListener('click', acao);
        return botao;
    }

    function adicionarDetalhes(lista, pares) {
        pares.forEach(function (par) {
            const rotulo = document.createElement('dt');
            rotulo.textContent = par[0];
            const valor = document.createElement('dd');
            valor.textContent = par[1];
            valor.className = par[2] || '';
            lista.appendChild(rotulo);
            lista.appendChild(valor);
        });
    }

    async function renderizar() {
        const estado = NewCoinNotasStore.carregar();
        const carteiraAtual = await NewCoinStore.carteira();

        listaNotas.textContent = '';
        if (!estado.notas.length) {
            const vazio = document.createElement('p');
            vazio.className = 'vazio';
            vazio.textContent = 'Nenhuma nota emitida ou importada.';
            listaNotas.appendChild(vazio);
        }

        const notas = estado.notas.slice().reverse();
        for (const nota of notas) {
            const validacao = await NewCoinNotasStore.validarNota(nota);
            const excluida = nota.estado && nota.estado.situacao === 'excluida';
            const situacao = excluida ? 'Excluída' : (validacao.valido ? 'Válida' : 'Inválida');
            const classeSituacao = validacao.valido ? 'ativa' : 'excluida';

            const cartao = document.createElement('article');
            cartao.className = 'nota-item';

            const cabecalho = document.createElement('header');
            const titulo = document.createElement('h4');
            titulo.textContent = 'Nota ' + nota.sequencia + ' · ' + resumo(nota.id, 18);
            const etiqueta = document.createElement('span');
            etiqueta.className = 'etiqueta-estado ' + classeSituacao;
            etiqueta.textContent = situacao;
            cabecalho.appendChild(titulo);
            cabecalho.appendChild(etiqueta);
            cartao.appendChild(cabecalho);

            const valor = document.createElement('p');
            valor.className = 'valor';
            valor.textContent = nota.valor + ' ' + nota.moeda;
            cartao.appendChild(valor);

            const detalhes = document.createElement('dl');
            detalhes.className = 'detalhes';
            adicionarDetalhes(detalhes, [
                ['Criada em', nota.criadoEm, 'mono'],
                ['Válida até', nota.validoAte, 'mono'],
                ['Portador', resumo(nota.portador, 48), 'mono'],
                ['Emissor', resumo(nota.emissor, 48), 'mono'],
                ['Justificativa', nota.justificativa || '—'],
                ['Hash', nota.hash, 'mono quebrar'],
                ['Anterior', nota.anterior, 'mono quebrar']
            ]);
            cartao.appendChild(detalhes);

            if (validacao.erros.length) {
                const erros = document.createElement('p');
                erros.className = 'situacao-erro';
                erros.textContent = 'Problemas: ' + validacao.erros.join(' | ');
                cartao.appendChild(erros);
            }
            if (validacao.avisos.length) {
                const avisos = document.createElement('p');
                avisos.className = 'dica';
                avisos.textContent = 'Avisos: ' + validacao.avisos.join(' | ');
                cartao.appendChild(avisos);
            }

            const acoes = document.createElement('div');
            acoes.className = 'acoes';
            acoes.appendChild(criarBotao('Baixar nota', 'pequeno', function () {
                NewCoinNotasStore.baixarNota(nota);
                mensagem(statusEmissao, 'Nota baixada: nota-' + nota.id + '.json', 'ok');
            }));
            if (nota.emissor === carteiraAtual.publicKeyPem && !excluida) {
                acoes.appendChild(criarBotao('Excluir', 'pequeno secundario', async function () {
                    if (!window.confirm('Excluir a nota ' + resumo(nota.id, 18) + '?')) {
                        return;
                    }
                    const motivo = window.prompt('Motivo da exclusão', 'Nota substituída');
                    try {
                        const arquivo = await NewCoinNotasStore.excluir({
                            id: nota.id,
                            motivo: motivo === null ? '' : motivo
                        });
                        mensagem(statusEmissao, 'Excluída em ' + arquivo.criadoEm + ' pelo arquivo ' + arquivo.id, 'ok');
                        await renderizar();
                    } catch (erro) {
                        mensagem(statusEmissao, 'Falha: ' + erro.message, 'erro');
                    }
                }));
            }
            cartao.appendChild(acoes);
            listaNotas.appendChild(cartao);
        }

        listaExclusoes.textContent = '';
        if (!estado.exclusoes.length) {
            const vazio = document.createElement('p');
            vazio.className = 'vazio';
            vazio.textContent = 'Nenhum arquivo de exclusão.';
            listaExclusoes.appendChild(vazio);
        }
        estado.exclusoes.slice().reverse().forEach(function (arquivo) {
            const cartao = document.createElement('article');
            cartao.className = 'nota-item';
            const titulo = document.createElement('h4');
            titulo.textContent = resumo(arquivo.id, 24);
            cartao.appendChild(titulo);
            const detalhes = document.createElement('dl');
            detalhes.className = 'detalhes';
            adicionarDetalhes(detalhes, [
                ['Criado em', arquivo.criadoEm, 'mono'],
                ['Notas', arquivo.notasExcluidas.map(function (item) { return resumo(item.id, 16); }).join(', ')],
                ['Hash', arquivo.hash, 'mono quebrar']
            ]);
            cartao.appendChild(detalhes);
            cartao.appendChild(criarBotao('Baixar arquivo', 'pequeno', function () {
                NewCoinNotasStore.baixarExclusao(arquivo);
                mensagem(statusEmissao, 'Arquivo baixado: exclusao-' + arquivo.id + '.json', 'ok');
            }));
            listaExclusoes.appendChild(cartao);
        });
    }

    form.addEventListener('submit', async function (evento) {
        evento.preventDefault();
        const botao = form.querySelector('button[type="submit"]');
        botao.disabled = true;
        mensagem(statusEmissao, 'Gerando hash e assinando nota...', 'info');
        try {
            const nota = await NewCoinNotasStore.emitir({
                valor: campoValor.value,
                moeda: campoMoeda.value,
                dias: campoDias.value,
                portador: campoPortador.value,
                justificativa: campoJustificativa.value
            });
            mensagem(statusEmissao, 'Nota emitida. Sequência ' + nota.sequencia + ', hash ' + nota.hash, 'ok');
            campoValor.value = '';
            campoJustificativa.value = '';
            await renderizar();
        } catch (erro) {
            mensagem(statusEmissao, 'Falha: ' + erro.message, 'erro');
        } finally {
            botao.disabled = false;
        }
    });

    botaoImportar.addEventListener('click', async function () {
        botaoImportar.disabled = true;
        mensagem(statusImportacao, 'Verificando arquivo...', 'info');
        try {
            let texto = campoJson.value.trim();
            const arquivo = inputArquivo.files && inputArquivo.files[0];
            if (arquivo) {
                texto = (await arquivo.text()).trim();
                campoJson.value = texto;
            }
            if (!texto) {
                throw new Error('Selecione um arquivo ou cole o JSON.');
            }
            const resultado = await NewCoinNotasStore.importar(JSON.parse(texto));
            const avisos = resultado.avisos && resultado.avisos.length
                ? ' Avisos: ' + resultado.avisos.join(' | ')
                : '';
            mensagem(statusImportacao, resultado.mensagem + avisos, 'ok');
            await renderizar();
        } catch (erro) {
            mensagem(statusImportacao, 'Falha: ' + erro.message, 'erro');
        } finally {
            botaoImportar.disabled = false;
        }
    });

    inputArquivo.addEventListener('change', async function () {
        const arquivo = inputArquivo.files && inputArquivo.files[0];
        if (arquivo) {
            campoJson.value = (await arquivo.text()).trim();
        }
    });

    NewCoinStore.carteira().then(function (carteiraAtual) {
        campoPortador.value = carteiraAtual.publicKeyPem;
        return renderizar();
    }).catch(function (erro) {
        mensagem(statusEmissao, 'Falha ao iniciar: ' + erro.message, 'erro');
    });
})();
