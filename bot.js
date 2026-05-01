const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({
    headless: true
  });

  const page = await browser.newPage();
  console.log("Carregando");

  try {
    // Ir para página de login
    await page.goto('https://jogofamous.com/index.php', {
      timeout: 60000,
      waitUntil: 'domcontentloaded'
    });
    
    const allInputs = await page.locator('input').all();
    
    await allInputs[6].fill('pedropaula575@gmail.com');
    await allInputs[7].fill('Pp80178562#');
    
    await Promise.all([
      page.waitForNavigation({ timeout: 60000 }),
      allInputs[8].click()
    ]);
    
    console.log("Logado com sucesso!");
    console.log("Extraindo itens...");
    
    await page.goto('https://jogofamous.com/projects?c=itens', {
      timeout: 60000,
      waitUntil: 'networkidle'
    });
    
    function getInicioSemana() {
      const agora = new Date();
      const agoraSP = new Date(
        agora.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" })
      );
      const dia = agoraSP.getDay();
      const diff = (dia >= 4) ? dia - 4 : 7 - (4 - dia);
      const quinta = new Date(agoraSP);
      quinta.setDate(agoraSP.getDate() - diff);
      quinta.setHours(22, 0, 0, 0);
      if (agoraSP < quinta) {
        quinta.setDate(quinta.getDate() - 7);
      }
      return quinta;
    }
    
    function getFimSemana(inicioSemana) {
      const fim = new Date(inicioSemana);
      fim.setDate(fim.getDate() + 7);
      fim.setMilliseconds(fim.getMilliseconds() - 1);
      return fim;
    }
    
    async function capturarTudo() {
    const inicioSemana = getInicioSemana();
    const fimSemana = getFimSemana(inicioSemana);

    const agora = new Date();

    const horasPassadas = (agora - inicioSemana) / (1000 * 60 * 60);
    const horasRestantes = (fimSemana - agora) / (1000 * 60 * 60);
    const linhas = page.locator('tbody tr:not(.footable-row-detail)');
    const total = await linhas.count();

    console.log(`TOTAL REAL: ${total}`);

    let lucroTotal = 0; 
    let lucroTotalEstimado = 0;

    for (let i = 0; i < total; i++) {
      const linha = linhas.nth(i);
      const tds = linha.locator('td');

      function extrairNumero(texto) {
        return Number(texto.replace(/[^0-9]/g, '')) || 0;
      }

      try {
        const nomeTexto = await tds.nth(0).innerText();
        const estoqueTexto = await tds.nth(2).innerText();
        const precoTexto = await tds.nth(4).innerText();
        const vendasTexto = await tds.nth(5).innerText();
        const lucroTexto = await tds.nth(6).innerText();

        const nome = nomeTexto.trim();
        const preco = precoTexto.trim();

        const vendas = extrairNumero(vendasTexto);
        const estoque = extrairNumero(estoqueTexto);
        const lucro = extrairNumero(lucroTexto);

        const vendasPorHora = vendas / horasPassadas;
        const vendasPorDia = vendasPorHora * 24;
        const vendasSemanaEstimada = vendasPorHora * 24 * 7;

        const lucroPorHora = lucro / horasPassadas;
        const lucroPorDia = lucroPorHora * 24;
        const lucroSemanaEstimada = lucro + (lucroPorHora * horasRestantes);

        const dados = {
          produtoIndex: i + 1,
          nome: nome,
          preco: preco,
          estoque: estoque,
          vendasSemana: vendas,
          lucroSemana: lucro,
        };

        lucroTotal += lucro;
        lucroTotalEstimado += lucroSemanaEstimada;

        console.log("Produto:", dados);

      } catch (error) {
        console.error(`Erro no item ${i + 1}:`, error.message);
      }
    }
      
    console.log("Finalizou todos os itens!");
    console.log(`LUCRO TOTAL: ${lucroTotal.toLocaleString()}`);
    console.log(`LUCRO TOTAL ESTIMADO SEMANA: ${Math.round(lucroTotalEstimado).toLocaleString()}`);

    const diasRestantes = Math.floor(horasRestantes / 24);
    const horasRestantesFinal = Math.floor(horasRestantes % 24);

    console.log(`LOJA RESETA EM: ${diasRestantes}d ${horasRestantesFinal}h`);
  }

  await capturarTudo();
  await browser.close();

  } catch (error) {
    console.error('Erro:', error.message);
  }
})();