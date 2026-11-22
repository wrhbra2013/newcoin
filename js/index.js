/*
 * newCoin - nucleo da criptomoeda (prototipo estatico para teste)
 * Roda no navegador com Web Crypto API. Nao usa require('crypto') do Node.
 *
 * - Transaction: dados + payload canonico + hash SHA-256 + assinatura RSA
 * - Block: liga a transacao ao bloco anterior por previousHash
 * - Chain: periodo atual com validacao de hashes, assinaturas e encadeamento
 * - Wallet: par de chaves RSA-SHA256 (gerado/importado no navegador)
 */
(function (global) {
    'use strict';

    const webCrypto = global.crypto || global.msCrypto;
    const encoder = new TextEncoder();
    const algoritmoAssinatura = 'RSASSA-PKCS1-v1_5';

    function assertCrypto() {
        if (!webCrypto || !webCrypto.subtle) {
            throw new Error(
                'Web Crypto indisponivel. Use um navegador moderno e abra a pagina por localhost ' +
                '(ex.: python3 -m http.server 3000) ou por file://.'
            );
        }
    }

    // Serializacao estavel: chaves ordenadas garantem o mesmo hash para o mesmo conteudo.
    function canonizar(valor) {
        if (Array.isArray(valor)) {
            return valor.map(canonizar);
        }
        if (valor !== null && typeof valor === 'object') {
            const resultado = {};
            Object.keys(valor).sort().forEach(function (chave) {
                if (valor[chave] !== undefined) {
                    resultado[chave] = canonizar(valor[chave]);
                }
            });
            return resultado;
        }
        return valor;
    }

    function serializar(valor) {
        return JSON.stringify(canonizar(valor));
    }

    function paraHex(buffer) {
        return Array.from(new Uint8Array(buffer))
            .map(function (byte) { return byte.toString(16).padStart(2, '0'); })
            .join('');
    }

    function paraBase64(buffer) {
        const bytes = new Uint8Array(buffer);
        let texto = '';
        for (let i = 0; i < bytes.length; i++) {
            texto += String.fromCharCode(bytes[i]);
        }
        return global.btoa(texto);
    }

    function deBase64(base64) {
        const texto = global.atob(base64);
        const bytes = new Uint8Array(texto.length);
        for (let i = 0; i < texto.length; i++) {
            bytes[i] = texto.charCodeAt(i);
        }
        return bytes.buffer;
    }

    function paraPem(derBase64, rotulo) {
        const linhas = derBase64.match(/.{1,64}/g) || [];
        return '-----BEGIN ' + rotulo + '-----\n' + linhas.join('\n') + '\n-----END ' + rotulo + '-----';
    }

    function dePem(pem) {
        return pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
    }

    function agoraISO() {
        return new Date().toISOString();
    }

    function novoId(prefixo) {
        if (webCrypto && typeof webCrypto.randomUUID === 'function') {
            return prefixo + '-' + webCrypto.randomUUID();
        }
        return prefixo + '-' + Date.now() + '-' + Math.random().toString(16).slice(2);
    }

    async function sha256(valor) {
        assertCrypto();
        const digest = await webCrypto.subtle.digest('SHA-256', encoder.encode(serializar(valor)));
        return paraHex(digest);
    }

    class Transaction {
        constructor(dados) {
            this.id = dados.id;
            this.origem = dados.origem;
            this.destino = dados.destino;
            this.valor = dados.valor;
            this.justificativa = dados.justificativa;
            this.timestamp = dados.timestamp;
            this.periodoId = dados.periodoId;
            this.previousHash = dados.previousHash;
            this.chavePublica = dados.chavePublica;
            this.hash = dados.hash || null;
            this.assinatura = dados.assinatura || null;
        }

        // Tudo que entra no hash. Hash e assinatura ficam de fora (evita autorreferencia).
        payload() {
            return {
                id: this.id,
                origem: this.origem,
                destino: this.destino,
                valor: this.valor,
                justificativa: this.justificativa,
                timestamp: this.timestamp,
                periodoId: this.periodoId,
                previousHash: this.previousHash,
                chavePublica: this.chavePublica
            };
        }

        async calcularHash() {
            return sha256(this.payload());
        }

        static async verificarAssinatura(transacao) {
            assertCrypto();
            const chave = await webCrypto.subtle.importKey(
                'spki',
                deBase64(dePem(transacao.chavePublica)),
                { name: algoritmoAssinatura, hash: 'SHA-256' },
                false,
                ['verify']
            );
            return webCrypto.subtle.verify(
                algoritmoAssinatura,
                chave,
                deBase64(transacao.assinatura),
                encoder.encode(serializar(transacao.payload()))
            );
        }

        static deJSON(objeto) {
            return new Transaction(objeto);
        }

        toJSON() {
            return {
                id: this.id,
                origem: this.origem,
                destino: this.destino,
                valor: this.valor,
                justificativa: this.justificativa,
                timestamp: this.timestamp,
                periodoId: this.periodoId,
                previousHash: this.previousHash,
                chavePublica: this.chavePublica,
                hash: this.hash,
                assinatura: this.assinatura
            };
        }
    }

    class Block {
        constructor(dados) {
            this.previousHash = dados.previousHash;
            this.transaction = dados.transaction instanceof Transaction
                ? dados.transaction
                : Transaction.deJSON(dados.transaction);
            this.timestamp = dados.timestamp;
            this.hash = dados.hash || null;
        }

        payload() {
            return {
                previousHash: this.previousHash,
                transaction: this.transaction.payload(),
                timestamp: this.timestamp
            };
        }

        async calcularHash() {
            return sha256(this.payload());
        }

        async validar() {
            const erros = [];
            if (this.hash !== await this.calcularHash()) {
                erros.push('hash do bloco nao confere');
            }
            if (this.transaction.id !== 'genesis' &&
                this.transaction.hash !== await this.transaction.calcularHash()) {
                erros.push('hash da transacao nao confere');
            }
            if (this.transaction.id !== 'genesis' &&
                !await Transaction.verificarAssinatura(this.transaction)) {
                erros.push('assinatura invalida');
            }
            return { valido: erros.length === 0, erros: erros };
        }

        static deJSON(objeto) {
            return new Block(objeto);
        }

        toJSON() {
            return {
                previousHash: this.previousHash,
                transaction: this.transaction.toJSON(),
                timestamp: this.timestamp,
                hash: this.hash
            };
        }
    }

    class Chain {
        constructor(periodoId, blocks) {
            this.periodoId = periodoId;
            this.blocks = blocks;
        }

        // Cada periodo começa com um bloco genesis, sem assinatura (nao e transacao de usuario).
        static async novo(periodoId) {
            const timestamp = agoraISO();
            const genesis = new Transaction({
                id: 'genesis',
                origem: 'sistema',
                destino: 'sistema',
                valor: 0,
                justificativa: 'Bloco genesis do periodo ' + periodoId,
                timestamp: timestamp,
                periodoId: periodoId,
                previousHash: '0',
                chavePublica: 'GENESIS',
                hash: null,
                assinatura: null
            });
            genesis.hash = await genesis.calcularHash();
            const bloco = new Block({
                previousHash: '0',
                transaction: genesis,
                timestamp: timestamp,
                hash: null
            });
            bloco.hash = await bloco.calcularHash();
            return new Chain(periodoId, [bloco]);
        }

        getPreviousBlockHash() {
            return this.blocks[this.blocks.length - 1].hash;
        }

        // Hash automatico gerado no momento da inclusao da transacao.
        async inserirTransacao(transacao) {
            transacao.previousHash = this.getPreviousBlockHash();
            transacao.hash = await transacao.calcularHash();
            const bloco = new Block({
                previousHash: transacao.previousHash,
                transaction: transacao,
                timestamp: transacao.timestamp,
                hash: null
            });
            bloco.hash = await bloco.calcularHash();
            this.blocks.push(bloco);
            return bloco;
        }

        async validar() {
            const erros = [];
            for (let i = 0; i < this.blocks.length; i++) {
                const bloco = this.blocks[i];
                const resultado = await bloco.validar();
                resultado.erros.forEach(function (erro) {
                    erros.push('Bloco ' + i + ': ' + erro);
                });
                if (i > 0 && bloco.previousHash !== this.blocks[i - 1].hash) {
                    erros.push('Bloco ' + i + ': previousHash nao corresponde ao bloco anterior');
                }
            }
            return { valido: erros.length === 0, erros: erros };
        }

        toJSON() {
            return {
                periodoId: this.periodoId,
                blocks: this.blocks.map(function (bloco) { return bloco.toJSON(); })
            };
        }

        static deJSON(objeto) {
            return new Chain(
                objeto.periodoId,
                (objeto.blocks || []).map(function (bloco) { return Block.deJSON(bloco); })
            );
        }
    }

    class Wallet {
        constructor(publicKeyPem, privateKeyPem) {
            this.publicKeyPem = publicKeyPem;
            this.privateKeyPem = privateKeyPem;
            this._keys = null;
        }

        static async gerar() {
            assertCrypto();
            const par = await webCrypto.subtle.generateKey(
                {
                    name: algoritmoAssinatura,
                    modulusLength: 2048,
                    publicExponent: new Uint8Array([1, 0, 1]),
                    hash: 'SHA-256'
                },
                true,
                ['sign', 'verify']
            );
            const publicKey = await webCrypto.subtle.exportKey('spki', par.publicKey);
            const privateKey = await webCrypto.subtle.exportKey('pkcs8', par.privateKey);
            return new Wallet(
                paraPem(paraBase64(publicKey), 'PUBLIC KEY'),
                paraPem(paraBase64(privateKey), 'PRIVATE KEY')
            );
        }

        async keyPair() {
            assertCrypto();
            if (!this._keys) {
                const opcoes = { name: algoritmoAssinatura, hash: 'SHA-256' };
                const publica = await webCrypto.subtle.importKey(
                    'spki', deBase64(dePem(this.publicKeyPem)), opcoes, true, ['verify']
                );
                const privada = await webCrypto.subtle.importKey(
                    'pkcs8', deBase64(dePem(this.privateKeyPem)), opcoes, true, ['sign']
                );
                this._keys = { publica: publica, privada: privada };
            }
            return this._keys;
        }

        async assinar(payload) {
            const chaves = await this.keyPair();
            const assinatura = await webCrypto.subtle.sign(
                algoritmoAssinatura,
                chaves.privada,
                encoder.encode(serializar(payload))
            );
            return paraBase64(assinatura);
        }

        // Mantem o nome "send" do prototipo, agora assincrono e com justificativa.
        async send(dados) {
            const chain = dados.chain;
            const transacao = new Transaction({
                id: novoId('tx'),
                origem: dados.origem,
                destino: dados.destino,
                valor: dados.valor,
                justificativa: dados.justificativa,
                timestamp: agoraISO(),
                periodoId: chain.periodoId,
                previousHash: chain.getPreviousBlockHash(),
                chavePublica: this.publicKeyPem
            });
            transacao.hash = await transacao.calcularHash();
            transacao.assinatura = await this.assinar(transacao.payload());
            return chain.inserirTransacao(transacao);
        }
    }

    global.NewCoin = {
        Transaction: Transaction,
        Block: Block,
        Chain: Chain,
        Wallet: Wallet,
        sha256: sha256,
        serializar: serializar,
        canonizar: canonizar,
        agoraISO: agoraISO,
        novoId: novoId,
        paraPem: paraPem,
        dePem: dePem,
        paraBase64: paraBase64,
        deBase64: deBase64
    };
})(window);
