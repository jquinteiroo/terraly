# Metodologia — Momento de Mercado

## Objetivo

Adicionar ao Terraly uma camada temporal que responda:

- como está o mercado imobiliário agora;
- se as condições estão melhorando ou piorando;
- quais meses historicamente concentram maior ou menor atividade;
- como juros, crédito e custo de construção alteram a viabilidade;
- quais sinais justificam aprofundar uma compra ou preparar uma venda.

O módulo **não deve afirmar "é hora de comprar" ou "é hora de vender" como certeza**. Ele deve expor indicadores, tendência, comparação histórica, cenários e nível de confiança.

## Princípio central

Separar:

1. **Condição atual do mercado**
2. **Sazonalidade observada**
3. **Tendência**
4. **Ciclo econômico**
5. **Hipóteses a testar**

Qualquer regra só entra no produto depois de backtest e validação.

---

## Fontes verificadas

### Banco Central — crédito imobiliário

Série SGS 20704:

- Concessões de crédito com recursos direcionados;
- Pessoas físicas;
- Financiamento imobiliário total;
- periodicidade mensal;
- início em março de 2011;
- unidade: milhões de reais.

Fonte:
https://dadosabertos.bcb.gov.br/dataset/20704-concessoes-de-credito-com-recursos-direcionados---pessoas-fisicas---financiamento-imobiliario

API:
https://api.bcb.gov.br/dados/serie/bcdata.sgs.20704/dados?formato=json

Uso no Terraly:

- medir expansão/retração do crédito imobiliário;
- comparar mês atual com média móvel;
- comparar mês com o mesmo mês de anos anteriores;
- calcular tendência de 3, 6 e 12 meses.

### Banco Central — Informações do Mercado Imobiliário

O Banco Central mantém mais de 4.000 séries mensais, incluindo crédito, imóveis financiados, fontes de recursos e outros indicadores, com parte dos detalhamentos por estado.

Fonte:
https://dadosabertos.bcb.gov.br/dataset/informacoes-do-mercado-imobiliario

Uso futuro:

- aprofundar análise estadual;
- observar volume e características do financiamento;
- cruzar condições de crédito com o estoque observado pelo Terraly.

### FipeZAP

O FipeZAP possui séries históricas mensais de preços anunciados de venda e locação.

Fonte:
https://www.fipe.org.br/pt-br/indices/fipezap/

Limitação:

O índice residencial acompanha principalmente apartamentos prontos em cidades cobertas. Portanto, **não é um índice direto de terrenos**.

Uso no Terraly:

- contexto de preço residencial;
- tendência de valorização/desvalorização da região quando coberta;
- comparação com inflação e juros.

### SINAPI

O SINAPI possui séries mensais de custos da construção, produzidas pelo IBGE em conjunto com a CAIXA.

Fonte:
https://www.ibge.gov.br/estatisticas/economicas/precos-e-custos/9270-sistema-nacional-de-pesquisa-de-custos-e-indices-da-construcao-civil.html

Uso no Terraly:

- tendência do custo da construção;
- variação mensal e em 12 meses;
- stress test de custo de obra;
- componente essencial para estratégias de construir e vender/alugar.

---

## Dados próprios do Terraly

A camada mais importante no longo prazo será criada pelo próprio sistema.

A cada snapshot dos anúncios, registrar:

- data de observação;
- preço;
- disponibilidade observada;
- bairro;
- condomínio;
- área;
- preço/m²;
- alterações de preço;
- entrada de novos anúncios;
- anúncios não observados novamente.

Nunca interpretar automaticamente "anúncio desapareceu" como "imóvel vendido".

Com histórico suficiente, será possível calcular:

### Estoque

Quantidade de terrenos observados por:

- cidade;
- bairro;
- condomínio;
- faixa de preço;
- faixa de área.

### Pressão de oferta

- novos anúncios por mês;
- crescimento/redução do estoque;
- número de terrenos semelhantes disponíveis.

### Alterações de preço

- percentual de anúncios com redução;
- redução mediana;
- frequência de redução;
- tempo até primeira redução.

### Tempo observado

Número de dias desde a primeira observação pelo Terraly.

Não chamar de "tempo no mercado" até existir uma data de publicação validada.

---

# Market Timing Score

Não criar um único score de "chance de sucesso".

O módulo deve possuir blocos separados.

## 1. Crédito

Exemplo:

**Crédito imobiliário: aquecendo**

Baseado em:

- concessões do mês;
- média móvel de 3 meses;
- comparação com 12 meses;
- percentil histórico.

## 2. Custo de construção

Exemplo:

**Pressão de custos: moderada**

Baseado em:

- SINAPI mensal;
- variação em 3 meses;
- variação em 12 meses.

## 3. Preços

Exemplo:

**Preços residenciais anunciados: em alta**

Quando houver cidade/índice compatível.

Nunca tratar FipeZAP residencial como preço direto de terreno.

## 4. Estoque Terraly

Exemplo:

**Oferta de terrenos semelhantes: baixa**

Somente depois de existir cobertura de dados suficiente.

## 5. Negociação

Exemplo:

**Sinais de maior flexibilidade dos vendedores**

Baseado no histórico próprio:

- número de reduções;
- magnitude das reduções;
- tempo observado;
- aumento de estoque.

Não inferir intenção do proprietário.

---

# Sazonalidade

Quando houver histórico suficiente, calcular por mês do ano:

- crédito imobiliário;
- quantidade de novos anúncios;
- estoque;
- redução de preços;
- volume de transações, quando houver fonte real;
- preços;
- custo de construção.

Comparar cada mês com sua tendência de longo prazo para evitar concluir que dezembro é "melhor" apenas porque historicamente possui valores nominais maiores.

## Saída na interface

Exemplo:

### Sazonalidade histórica

**Compra**

Janeiro — abaixo da média  
Fevereiro — neutro  
Março — acima da média

**Venda**

Não exibir até termos uma variável confiável de transações/vendas.

---

# Ciclo eleitoral e presidencial

A hipótese citada por investidores — de que determinados anos de mandato ou anos eleitorais afetam o mercado — deve ser tratada exclusivamente como **variável de pesquisa**.

Criar variáveis:

- ano eleitoral: sim/não;
- ano do ciclo presidencial: 1, 2, 3 ou 4;
- período pré-eleitoral;
- período pós-eleitoral.

Depois testar contra:

- crédito imobiliário;
- preços;
- volume de transações;
- estoque;
- custos;
- juros.

## Regra

Não criar regras como:

> "Segundo ano de mandato é melhor para investir."

Só apresentar um efeito se:

1. houver série histórica suficiente;
2. o resultado persistir em diferentes ciclos;
3. o efeito não desaparecer ao controlar variáveis econômicas relevantes;
4. a interface deixar claro que correlação não implica causalidade.

Mudança de governo, presidente ou partido nunca deve gerar recomendação automática.

---

# Tela proposta

## Momento de Mercado

### Agora

- Crédito imobiliário
- Juros
- Custo de construção
- Tendência de preços
- Estoque Terraly
- Alterações de preço

### Histórico

Gráfico mensal com 5 a 10 anos.

### Sazonalidade

Heatmap de janeiro a dezembro.

### Cenários

**Condição de compra**
- crédito expandindo;
- custos desacelerando;
- estoque aumentando;
- reduções de preço aumentando.

**Condição de venda**
- crédito expandindo;
- estoque diminuindo;
- preços subindo;
- poucas reduções.

Essas combinações devem ser apresentadas como **condições favoráveis/desfavoráveis nos indicadores**, não como recomendação individual.

---

# Nível de confiança

Exibir junto da análise:

### Alto
Indicadores oficiais + histórico próprio suficiente.

### Médio
Indicadores oficiais, mas pouca granularidade local.

### Baixo
Pouco histórico local ou dependência de proxies.

---

# Roadmap

## Fase 1

Integrar:

- BCB crédito imobiliário;
- juros;
- SINAPI;
- FipeZAP quando aplicável.

Mostrar tendência, sem previsão.

## Fase 2

Criar histórico de snapshots do Terraly.

Adicionar:

- estoque;
- novos anúncios;
- redução de preço;
- tempo observado.

## Fase 3

Sazonalidade.

Exigir pelo menos 24 meses de histórico próprio para métricas locais sazonais; preferir 36+ meses.

## Fase 4

Backtests.

Testar:

- juros;
- crédito;
- custos;
- meses do ano;
- ciclo eleitoral/presidencial como variável neutra de pesquisa.

## Fase 5

Modelos preditivos somente se os backtests justificarem.

Nunca gerar previsão ou recomendação apenas porque existe uma correlação histórica.
