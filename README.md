# Terraly

**Terraly** é um projeto de inteligência para **descoberta e pré-análise de oportunidades imobiliárias**, com foco inicial em terrenos para estratégias de **compra + construção + venda**.

A proposta não é dizer ao usuário "compre este terreno". O objetivo é reduzir o universo de opções e mostrar **quais ativos merecem investigação mais profunda**, com dados rastreáveis, premissas explícitas, riscos e pendências.

> **Status:** pesquisa e validação de dados. O produto ainda não está em fase de desenvolvimento do MVP.

## Objetivo

A visão do Terraly é permitir que um investidor informe sua estratégia — cidade, capital disponível, tipologia, margem-alvo e nível de risco — e receba uma triagem de terrenos compatíveis.

No futuro, uma análise poderá combinar:

- preço e área do terreno;
- preço por m² e comparáveis;
- localização e características do entorno;
- condomínio e infraestrutura;
- topografia quando explicitamente informada ou tecnicamente validada;
- parâmetros urbanísticos;
- hipótese de potencial construtivo;
- custos de construção;
- estimativa de saída;
- cenários financeiros e testes de estresse;
- nível de completude e confiabilidade dos dados.

Toda conclusão deverá mostrar **como foi calculada** e quais informações ainda precisam de validação profissional.

## Primeiro experimento de dados

O primeiro dataset do projeto foi coletado em **1º de outubro de 2026**, usando anúncios de lotes/terrenos residenciais em **Indaiatuba/SP**.

A coleta inicial contém **30 anúncios únicos por `listing_id`**. Cada página foi visitada individualmente para enriquecimento dos dados. Não foi executado um crawl amplo nesta etapa.

Arquivos:

- [Dataset bruto em JSON](data/raw/vivareal_indaiatuba_2026-10-01.json)
- [Dataset normalizado em CSV](data/processed/vivareal_indaiatuba_2026-10-01.csv)
- [Relatório de qualidade e análise exploratória](data/processed/vivareal_indaiatuba_2026-10-01_quality_report.md)

## Qualidade da amostra

| Campo / verificação | Cobertura |
|---|---:|
| Preço | 30/30 |
| Área | 30/30 |
| Endereço/rua exibido | 29/30 |
| Condomínio identificado | 20/30 |
| Informação de condomínio | 29/30 |
| Informação de IPTU | 27/30 |
| Coordenadas | 30/30 |
| Topografia explicitamente mencionada | 11/30 |
| Dimensões lineares ou testada | 3/30 |

### Estatísticas exploratórias

| Métrica | Resultado |
|---|---:|
| Menor preço | R$ 169.800 |
| Maior preço | R$ 580.000 |
| Mediana de preço | R$ 280.000 |
| Menor preço/m² | R$ 557,10 |
| Maior preço/m² | R$ 3.200,00 |
| Mediana de preço/m² | R$ 1.453,23 |

A amostra é suficiente para validar o pipeline de coleta e o esquema dos dados, **mas não é suficiente para conclusões robustas sobre o mercado de Indaiatuba ou sobre bairros específicos**.

## O que já aprendemos

### 1. Duplicidade precisa ser tratada como problema central

Embora os 30 `listing_id` sejam diferentes, a amostra já apresentou:

- um grupo de quatro registros com mesma combinação de endereço, bairro, área e preço;
- um par com mesmo endereço, preço, condomínio e coordenadas, mas área anunciada de 300 m² versus 299 m².

O Terraly deverá fazer **deduplicação conservadora**, preservando os registros originais e sinalizando suspeitas em vez de apagar dados automaticamente.

### 2. Coordenada não significa localização exata do lote

Todos os registros possuem latitude e longitude, mas o ponto divulgado pelo portal pode representar uma posição aproximada.

Por isso, coordenadas de anúncio **não devem ser usadas diretamente para afirmar zoneamento ou restrições de um lote** sem validação da localização.

### 3. Datas precisam de normalização e validação

Foram encontrados formatos absolutos e relativos, além de datas aparentemente incompatíveis com o horário da coleta.

Esses valores são preservados como evidência de origem e não devem alimentar análises temporais até passarem por validação.

### 4. Ausência continua sendo ausência

O pipeline não deve inventar valores faltantes.

Exemplos:

- topografia não mencionada → `null`;
- testada não informada → `null`;
- "isento" não é silenciosamente convertido em zero;
- preço anunciado não é tratado como preço de transação;
- desaparecimento de um anúncio não significa venda.

## Princípios do projeto

1. **Rastreabilidade:** cada número relevante deve manter sua origem e data.
2. **Sem inferência silenciosa:** informação desconhecida permanece desconhecida.
3. **Separação entre fato e estimativa:** anúncio, premissa, dado oficial e cálculo não são equivalentes.
4. **Cálculo reproduzível:** métricas financeiras devem vir de fórmulas e entradas versionadas.
5. **Incerteza visível:** pendências devem aparecer junto do resultado.
6. **Revisão humana em pontos críticos:** urbanismo, documentação, topografia, sondagem e orçamento não devem ser substituídos por um score.
7. **Sem recomendação automática de compra:** o sistema faz triagem e pré-viabilidade.

## Estrutura atual

```text
terraly/
└── data/
    ├── raw/
    │   └── vivareal_indaiatuba_2026-10-01.json
    └── processed/
        ├── vivareal_indaiatuba_2026-10-01.csv
        └── vivareal_indaiatuba_2026-10-01_quality_report.md
```

### `data/raw`

Mantém a observação mais próxima possível da coleta original, incluindo metadados e evidências de origem.

### `data/processed`

Contém a versão normalizada para análise e o relatório de qualidade da coleta.

Snapshots futuros devem ser **versionados por data**, sem sobrescrever observações anteriores, permitindo formar histórico de preço e disponibilidade.

## Próxima etapa

Antes de desenvolver a aplicação, o próximo experimento recomendado é ampliar a base para aproximadamente **100–200 anúncios**, mantendo o mesmo rigor de coleta.

A expansão deve incluir:

- deduplicação conservadora;
- validação da precisão das coordenadas;
- normalização de datas;
- identificação da periodicidade de condomínio e IPTU;
- acompanhamento de anúncios indisponíveis ou alterados;
- snapshots históricos;
- melhoria da normalização de bairros e condomínios;
- avaliação da qualidade dos comparáveis.

Só depois disso faz sentido começar a cruzar os candidatos com outras camadas, como:

- regras urbanísticas oficiais;
- custos de construção;
- dados territoriais;
- comparáveis adequados à tipologia;
- cenários financeiros.

## Direção técnica planejada

A arquitetura ainda não foi implementada. A direção atualmente considerada é:

- **Backend:** Laravel
- **Frontend:** Vue
- **Banco:** PostgreSQL + PostGIS
- **Processamento:** filas para importação e validação
- **Motor financeiro:** determinístico e versionado
- **IA:** opcional, usada principalmente para explicação e interpretação — nunca para fabricar números ausentes

Essa stack poderá mudar conforme os testes de dados e do produto.

## Limitações importantes

Este repositório está em fase experimental.

Os dados atuais vêm de páginas de terceiros e podem conter erros, informações desatualizadas, localizações aproximadas ou descrições fornecidas pelos próprios anunciantes. A presença de um anúncio na base **não significa que o imóvel esteja disponível no momento da consulta**.

Além disso, a viabilidade comercial do Terraly depende de resolver de forma sustentável o acesso a ofertas e comparáveis. O uso de dados de terceiros em um produto comercial deve respeitar os respectivos termos, licenças e direitos de armazenamento, exibição e derivação.

## Aviso

O Terraly é uma ferramenta experimental de apoio à análise e **não constitui recomendação de investimento, avaliação imobiliária, parecer jurídico, projeto arquitetônico ou laudo de engenharia**.

Qualquer decisão real de aquisição ou construção deve ser precedida das verificações técnicas, documentais, urbanísticas, financeiras e jurídicas aplicáveis.


## Dashboard de exploração

O repositório também possui uma interface web estática para explorar o primeiro dataset:

- resumo da amostra;
- filtros por localização, preço e topografia;
- mapa dos anúncios;
- gráfico de área × preço por m²;
- sinalização conservadora de possíveis duplicidades;
- destaque de extremos estatísticos para investigação;
- painel detalhado de cada anúncio.

Arquivos da interface:

- `index.html`
- `styles.css`
- `app.js`

### Rodar localmente

Como a interface lê o JSON com `fetch()`, abra o projeto por um servidor HTTP em vez de abrir o `index.html` diretamente.

Exemplo:

```bash
python -m http.server 8000
```

Depois acesse:

```text
http://localhost:8000
```

A tela também pode ser publicada diretamente com GitHub Pages usando a raiz da branch `master`.

> Importante: os destaques da interface são sinais exploratórios. A tela não classifica terrenos como bons investimentos e não substitui validação urbanística, jurídica, técnica ou financeira.
