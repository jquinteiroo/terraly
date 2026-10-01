# Relatório de qualidade — Viva Real Indaiatuba — 2026-10-01

## Escopo e método

- 30 anúncios únicos por `listing_id`, oriundos da coleta inicial.
- Cada uma das 30 URLs foi visitada individualmente com Firecrawl; não foi executado crawl amplo.
- Ausências permanecem `null`. “Isento” é representado por valor nulo mais flag `*_exempt = true`.
- `price_per_m2_brl` foi calculado como preço ÷ área, com duas casas decimais.
- `lot_dimensions` só contém medidas lineares explícitas; valores que apenas repetiam a área em m² foram descartados desse campo.
- Datas relativas ou inconsistentes foram preservadas como exibidas, sem conversão ou correção inferida.

## Qualidade e completude

| Verificação | Resultado |
|---|---:|
| Anúncios com preço | 30/30 |
| Anúncios com área | 30/30 |
| Anúncios com endereço/rua exibido | 29/30 |
| Anúncios com nome de condomínio identificado | 20/30 |
| Anúncios com informação de taxa condominial (valor ou isenção) | 29/30 |
| Anúncios com informação de IPTU (valor ou isenção) | 27/30 |
| Anúncios com valor numérico de IPTU | 18/30 |
| Anúncios com latitude e longitude | 30/30 |
| Anúncios com topografia explicitamente mencionada | 11/30 |
| Anúncios com dimensões lineares ou testada/frente | 3/30 |

### Possíveis duplicidades

- IDs são únicos: 30/30; URLs canônicas e IDs não se repetem.
- Mesma combinação endereço + bairro + área + preço: 2912449474, 2888710596, 2900482669, 2888705229.
- Possível duplicidade aproximada: 2912454824 e 2906791874 — mesmo endereço, preço, condomínio e coordenadas, com área anunciada de 300 m² versus 299 m².
- Esses grupos não foram removidos: podem ser anúncios distintos ou republicações por anunciantes diferentes e exigem conferência.

### Campos recorrentes ainda não coletados

- vagas: 19 páginas
- banheiros: 19 páginas
- quartos: 18 páginas
- suítes: 9 páginas

Esses campos são recorrentes na interface genérica do portal, mas não entraram no esquema por terem baixa utilidade para terrenos. “Aceita animais” apareceu em apenas 1 página e, portanto, ainda não é recorrente. Preço, condomínio e IPTU também reapareceram no levantamento, mas já fazem parte do esquema. Nenhum outro campo ainda não coletado apareceu em pelo menos 3 páginas. Códigos internos do imóvel e disponibilidade para financiamento/permuta devem ser reavaliados na próxima amostra caso apareçam de forma consistente.

### Alertas de qualidade

- Algumas datas vieram em formato relativo (“há 5 dias”, “1 dia”) e outras parecem posteriores ao horário da coleta. Foram preservadas literalmente; não devem ser usadas em análises temporais antes de validação.
- Coordenadas podem representar o ponto divulgado pelo portal, não necessariamente a posição exata do lote.
- Nome do condomínio pode coincidir com o nome do bairro/empreendimento; foi mantido somente quando o enriquecimento o identificou explicitamente.
- Valores de condomínio e IPTU refletem o anúncio e podem ser mensais, anuais ou estar desatualizados quando a página não esclarece a periodicidade.

## Análise exploratória

| Métrica | Resultado |
|---|---:|
| Menor preço | R$ 169.800,00 |
| Maior preço | R$ 580.000,00 |
| Mediana de preço | R$ 280.000,00 |
| Menor preço/m² | R$ 557,10/m² |
| Maior preço/m² | R$ 3.200,00/m² |
| Mediana de preço/m² | R$ 1.453,23/m² |

### Distribuição por bairro

- Loteamento Residencial Vila Fahl: 4
- Parque Barnabé: 4
- Chácara Areal: 3
- Jardim Residencial Nova Veneza: 2
- Mato Dentro: 2
- Altos da Bela Vista: 1
- Jardim Bela Vista: 1
- Jardim Bom Sucesso: 1
- Jardim Casablanca: 1
- Jardim Colonial: 1
- Jardim das Maritacas: 1
- Jardim Panorama: 1
- Jardim Park Real: 1
- Jardim Paulista II: 1
- Jardim Residencial Dona Lucilla: 1
- Jardins Di Roma: 1
- Parque Campo Bonito: 1
- Parque Residencial Sabiás: 1
- Residencial Milano: 1
- Vila Rubens: 1

### Mediana de preço/m² por bairro

Considerou-se amostra suficiente, nesta fase de teste, como pelo menos 3 anúncios no bairro.

- Loteamento Residencial Vila Fahl (n=4): R$ 1.866,67/m²
- Parque Barnabé (n=4): R$ 1.300,00/m²
- Chácara Areal (n=3): R$ 1.317,73/m²

### Candidatos a investigação

Critério exploratório: preço/m² abaixo de 60% ou acima de 160% da mediana global (R$ 1.453,23/m²). Isso apenas sinaliza registros para conferência; não indica oportunidade, preço justo ou qualidade de investimento.

- 2483819402 — Jardim Panorama: R$ 557,10/m² — [anúncio](https://www.vivareal.com.br/imovel/lote-terreno-jardim-panorama-bairros-indaiatuba-359m2-venda-RS200000-id-2483819402/?source=ranking%2Crp)
- 2427710117 — Jardim Residencial Dona Lucilla: R$ 850,00/m² — [anúncio](https://www.vivareal.com.br/imovel/lote-terreno-jardim-residencial-dona-lucilla-bairros-indaiatuba-300m2-venda-RS255000-id-2427710117/?source=ranking%2Crp)
- 2906649016 — Jardim Park Real: R$ 2.396,19/m² — [anúncio](https://www.vivareal.com.br/imovel/lote-terreno-jardim-park-real-bairros-indaiatuba-160m2-venda-RS383391-id-2906649016/?source=ranking%2Crp)
- 2909306965 — Jardim Colonial: R$ 3.200,00/m² — [anúncio](https://www.vivareal.com.br/imovel/lote-terreno-jardim-colonial-bairros-indaiatuba-150m2-venda-RS480000-id-2909306965/?source=ranking%2Crp)

## Adequação para ampliar a amostra

Os 30 registros são suficientes para validar o esquema, o fluxo Firecrawl, a representação de isenções, a captura de coordenadas e a detecção inicial de duplicidades. Não são suficientes para conclusões de mercado ou comparações robustas na maioria dos bairros.

A base pode avançar para uma amostra de **100–200 anúncios**, desde que a próxima etapa inclua deduplicação conservadora, validação de datas, registro da periodicidade de condomínio/IPTU e monitoramento de páginas indisponíveis ou alteradas. A ampliação deve manter os dados brutos e as evidências de origem sem produzir avaliações de investimento.
