# newCoin — protótipo estático para teste

Versão 100% estática (HTML/CSS/JS no navegador). Não há API, banco de dados nem persistência em servidor: transações, carteira e arquivos ficam no `localStorage` do navegador.

## Como testar

Abra `newcoin.html` diretamente no navegador, ou sirva a pasta sem qualquer backend:

```bash
cd /home/wander/newcoin
python3 -m http.server 3000
# http://localhost:3000/newcoin.html
```

Também funciona com `node server.js` (o Express apenas serve os arquivos estáticos; `transacoes.html` passou a ser servido pela raiz).

## Telas

- `newcoin.html` — formulário de nova transação (origem, destino, valor e **justificativa**).
- `transacoes.html` — transações do período atual, validação de cada bloco, download de comprovantes, encerramento de período e arquivos gerados.
- `notas.html` — emissão de notas de valor, exclusão por timestamp, download/importação de arquivos `.json` e validação offline.
- `teste.html` — autoteste no navegador (limpa os dados locais e verifica hash, assinatura, adulteração, invalidação por arquivo, importação e sequência monotônica).

## O que foi implementado

- **Hash automático**: cada nova transação recebe um SHA-256 calculado sobre um payload canônico (chaves ordenadas) que inclui origem, destino, valor, justificativa, timestamp ISO, chave pública e `previousHash`.
- **Assinatura**: RSASSA-PKCS1-v1_5/SHA-256 com Web Crypto; a verificação usa a chave pública embutida na própria transação.
- **Corrente**: cada bloco guarda seu hash e o `previousHash`; a página de transações valida hash da transação, hash do bloco, assinatura e encadeamento.
- **Arquivamento/invalidação**: "Encerrar período" gera um arquivo JSON com `criadoEm` (timestamp atual), `hashDoPeriodo` e a lista de períodos invalidados. As transações antigas permanecem no arquivo apenas para auditoria; um novo período é iniciado.
- **Comprovantes**: cada transação pode ser baixada como JSON (`comprovante-transacao`) contendo bloco, hash, assinatura, justificativa e resultado da verificação.
- **Reinício**: botão para limpar os dados de teste e recriar carteira/período.

## Notas de valor P2P offline

A unidade monetária é uma **nota** (`tipo: "nota-valor"`) assinada pelo emissor, com `valor`, `moeda`, `portador`, `justificativa`, `criadoEm`, `validoAte`, `hash` e `assinatura`. Ela é um `.json` que pode ser copiado entre máquinas (USB, e-mail, QR, Bluetooth) e validado sem internet.

- **Inclusão (sequência monotônica)**: cada emissor numera suas notas com `sequencia` crescente; a nota nova aponta para o `hash` da anterior. A importação rejeita replay (sequência menor ou repetida) e hash anterior divergente; lacunas geram aviso.
- **Exclusão (timestamp)**: um `arquivo-exclusao` assinado, com `criadoEm` posterior ao da nota, a marca como excluída. Notas antigas ficam preservadas como lastro/auditoria, mas deixam de ser válidas. A expiração por `validoAte` também exclui automaticamente.
- **Validação offline**: verifica hash, assinatura do emissor, integridade do payload, validade temporal, sequência e as exclusões conhecidas.
- **Limite fundamental**: sem conexão não há como impedir que a mesma nota seja gasta em duas máquinas antes de trocarem arquivos; o conflito é detectado quando os arquivos se encontram. Para uso real seriam necessários relógio seguro/TSA, armazenamento de chave em hardware e regra de resolução de conflitos.

## Limitações (protótipo)

- O timestamp é gerado **no navegador**: em um teste puramente estático não há servidor que o ateste. Para prova de tempo real seria necessário um carimbo do tempo (RFC 3161/TSA) ou timestamp de servidor.
- A chave privada fica em `localStorage`: serve para teste local, não é armazenamento seguro.
- Não há consenso, saldo, mineração nem rede de nós — é uma simulação local da estrutura de blocos.
- Web Crypto exige contexto seguro; se `crypto.subtle` não estiver disponível via `file://`, use `http://localhost` conforme instrução acima.
