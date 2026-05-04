// server.js
import express from 'express';
import cors from 'cors';
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import cron from 'node-cron';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// Variável para controle de execução
let isRunning = false;

// FUNÇÃO REUTILIZÁVEL: Login e navegação inicial
async function fazerLoginENavegar(page, urlDestino = null) {
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
  
  if (urlDestino) {
    await page.goto(urlDestino, {
      timeout: 60000,
      waitUntil: 'networkidle'
    });
    console.log(`Navegou para: ${urlDestino}`);
  }
}

function extrairNumero(texto) {
  return Number(texto.replace(/[^0-9]/g, '')) || 0;
}

// FUNÇÃO: Processo completo de estoque
async function executarEstoque() {
  console.log(`\n[${new Date().toISOString()}] === INICIANDO PROCESSO DE ESTOQUE ===`);
  
  const browser = await chromium.launch({
    headless: true
  });

  const page = await browser.newPage();

  try {
    await fazerLoginENavegar(page, 'https://jogofamous.com/projects?c=itens');
    
    console.log("Página de estoque aberta com sucesso!");
    await page.waitForTimeout(5000);
    
    // Extrair IDs dos itens
    console.log("Extraindo IDs dos itens...");
    await page.waitForSelector('tbody tr', { timeout: 30000 });
    
    const itensInfo = await page.evaluate(() => {
      const itens = [];
      const linhas = document.querySelectorAll('tbody tr:not(.footable-row-detail)');
      
      linhas.forEach(linha => {
        const botaoGerenciar = linha.querySelector('button.btn-dark');
        if (botaoGerenciar && botaoGerenciar.getAttribute('onclick')) {
          const onclick = botaoGerenciar.getAttribute('onclick');
          const match = onclick.match(/item=(\d+)/);
          if (match) {
            const id = match[1];
            const nome = linha.querySelector('td:first-child')?.innerText?.trim() || '';
            const estoqueTexto = linha.querySelector('td:nth-child(3)')?.innerText || '';
            const precoTexto = linha.querySelector('td:nth-child(5)')?.innerText || '';
            
            itens.push({
              id: id,
              nome: nome,
              estoqueTexto: estoqueTexto,
              precoTexto: precoTexto
            });
          }
        }
      });
      return itens;
    });
    
    console.log(`IDs extraídos: ${itensInfo.length}`);
    
    let itensZero = [];
    let itensAlterados = [];
    
    for (const item of itensInfo) {
      const estoque = extrairNumero(item.estoqueTexto);
      const precoNumerico = extrairNumero(item.precoTexto);
      
      if (estoque === 0) {
        itensZero.push({
          id: item.id,
          nome: item.nome,
          precoTexto: item.precoTexto,
          precoNumerico: precoNumerico
        });
      }
    }
    
    console.log(`Itens sem estoque: ${itensZero.length}`);
    
    // Processar itens sem estoque
    for (const item of itensZero) {
      console.log(`Processando item: ${item.nome} (ID: ${item.id})`);
      
      const urlItem = `https://jogofamous.com/projects?item=${item.id}`;
      await page.goto(urlItem, { timeout: 60000, waitUntil: 'networkidle' });
      await page.waitForTimeout(3000);
      
      if (item.precoNumerico !== 1) {
        console.log(`Alterando preço de ${item.precoTexto} para $1`);
        
        try {
          await page.waitForSelector('a[href="#price-b2"]', { timeout: 10000 });
          const abaPreco = await page.locator('a[href="#price-b2"]').first();
          await abaPreco.click();
          await page.waitForTimeout(2000);
          
          await page.waitForSelector('input[name="valoritem"]', { timeout: 10000 });
          const campoPreco = await page.locator('input[name="valoritem"]').first();
          await campoPreco.click({ clickCount: 3 });
          await campoPreco.fill('1');
          await page.waitForTimeout(1000);
          
          const botaoAlterar = await page.locator('input[name="guardarprice"]').first();
          await botaoAlterar.click();
          await page.waitForTimeout(3000);
          
          console.log(`Preço alterado para $1 com sucesso!`);
          
          itensAlterados.push({
            id: item.id,
            nome: item.nome,
            precoOriginal: item.precoTexto,
            precoOriginalNumerico: item.precoNumerico
          });
        } catch (error) {
          console.error(`Erro ao alterar preço:`, error.message);
        }
      }
    }
    
    // Compra de estoque
    if (itensZero.length > 0) {
      console.log("\n=== INICIANDO COMPRA DE ESTOQUE ===");
      
      await page.goto('https://jogofamous.com/projects?c=itens', {
        timeout: 60000,
        waitUntil: 'networkidle'
      });
      await page.waitForTimeout(3000);
      
      try {
        const botaoEstoque = await page.locator('button:has-text("Estoque")').first();
        await botaoEstoque.click();
        await page.waitForTimeout(2000);
        
        const selectItem = await page.locator('select[name="item"]');
        await selectItem.selectOption('Todos');
        await page.waitForTimeout(1000);
        
        const campoQuantidade = await page.locator('input[name="estoque"]');
        await campoQuantidade.fill('500000');
        await page.waitForTimeout(1000);
        
        const botaoProximo = await page.locator('input[name="guardarestoque1"]');
        await botaoProximo.click();
        await page.waitForTimeout(3000);
        
        const botaoAdicionar = await page.locator('input[name="guardarestoquetodos"]');
        await botaoAdicionar.click();
        await page.waitForTimeout(3000);
        
        console.log("Compra de estoque realizada com sucesso!");
      } catch (error) {
        console.error("Erro ao comprar estoque:", error.message);
      }
    }
    
    // Restaurar preços
    if (itensAlterados.length > 0) {
      console.log("\n=== RESTAURANDO PREÇOS ORIGINAIS ===");
      
      for (const item of itensAlterados) {
        console.log(`Restaurando preço de ${item.nome} para ${item.precoOriginal}`);
        
        const urlItem = `https://jogofamous.com/projects?item=${item.id}`;
        await page.goto(urlItem, { timeout: 60000, waitUntil: 'networkidle' });
        await page.waitForTimeout(3000);
        
        try {
          await page.waitForSelector('a[href="#price-b2"]', { timeout: 10000 });
          const abaPreco = await page.locator('a[href="#price-b2"]').first();
          await abaPreco.click();
          await page.waitForTimeout(2000);
          
          await page.waitForSelector('input[name="valoritem"]', { timeout: 10000 });
          const campoPreco = await page.locator('input[name="valoritem"]').first();
          await campoPreco.click({ clickCount: 3 });
          await campoPreco.fill(item.precoOriginalNumerico.toString());
          await page.waitForTimeout(1000);
          
          const botaoAlterar = await page.locator('input[name="guardarprice"]').first();
          await botaoAlterar.click();
          await page.waitForTimeout(3000);
          
          console.log(`Preço restaurado para ${item.precoOriginal} com sucesso!`);
        } catch (error) {
          console.error(`Erro ao restaurar preço:`, error.message);
        }
      }
    }
    
    console.log(`\n[${new Date().toISOString()}] === PROCESSO DE ESTOQUE FINALIZADO ===`);
    await browser.close();
    return { success: true, itensProcessados: itensZero.length };
    
  } catch (error) {
    console.error('Erro no estoque:', error.message);
    await browser.close();
    throw error;
  }
}

// FUNÇÃO: Coleta de dados (scraping)
async function executarColetaDados() {
  console.log(`\n[${new Date().toISOString()}] === INICIANDO COLETA DE DADOS ===`);
  
  const browser = await chromium.launch({
    headless: true
  });

  const page = await browser.newPage();

  try {
    await fazerLoginENavegar(page, 'https://jogofamous.com/projects?c=itens');
    
    console.log("Extraindo itens...");
    
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
    const produtosArray = [];

    for (let i = 0; i < total; i++) {
      const linha = linhas.nth(i);
      const tds = linha.locator('td');

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
        const lucroPorHora = lucro / horasPassadas;
        const lucroPorDia = lucroPorHora * 24;
        const lucroSemanaEstimada = lucro + (lucroPorHora * horasRestantes);

        const produto = {
          produtoIndex: i + 1,
          nome: nome,
          preco: preco,
          estoque: estoque,
          vendasSemana: vendas,
          lucroSemana: lucro,
          vendasPorHora: Math.round(vendasPorHora * 100) / 100,
          vendasPorDia: Math.round(vendasPorDia * 100) / 100,
          lucroPorHora: Math.round(lucroPorHora * 100) / 100,
          lucroPorDia: Math.round(lucroPorDia * 100) / 100,
        };

        produtosArray.push(produto);
        lucroTotal += lucro;
        lucroTotalEstimado += lucroSemanaEstimada;

        console.log(`Produto ${i+1}: ${nome} - Vendas: ${vendas} - Lucro: ${lucro}`);

      } catch (error) {
        console.error(`Erro no item ${i + 1}:`, error.message);
      }
    }
      
    const diasRestantes = Math.floor(horasRestantes / 24);
    const horasRestantesFinal = Math.floor(horasRestantes % 24);
    const vendasTotal = produtosArray.reduce((sum, p) => sum + p.vendasSemana, 0);
    const vendasPorHoraMedia = vendasTotal / horasPassadas;
    const vendasPorDiaMedia = vendasPorHoraMedia * 24;

    console.log(`LUCRO TOTAL: ${lucroTotal.toLocaleString()}`);
    console.log(`LOJA RESETA EM: ${diasRestantes}d ${horasRestantesFinal}h`);

    await browser.close();

    const dados = {
      produtos: produtosArray,
      lucroTotal: lucroTotal,
      lucroTotalEstimado: Math.round(lucroTotalEstimado),
      vendasPorHoraMedia: Math.round(vendasPorHoraMedia * 100) / 100,
      vendasPorDiaMedia: Math.round(vendasPorDiaMedia * 100) / 100,
      tempoReset: `${diasRestantes}d ${horasRestantesFinal}h`,
      dataColeta: new Date().toISOString(),
      totalProdutos: produtosArray.length
    };

    console.log(`\n[${new Date().toISOString()}] === COLETA DE DADOS FINALIZADA ===`);
    return dados;

  } catch (error) {
    console.error('Erro na coleta:', error.message);
    await browser.close();
    throw error;
  }
}

// FUNÇÃO PRINCIPAL: Executa primeiro estoque, depois coleta
async function executarCicloCompleto() {
  if (isRunning) {
    console.log(`[${new Date().toISOString()}] Ciclo já em execução, ignorando...`);
    return { success: false, message: "Já está rodando" };
  }
  
  isRunning = true;
  console.log(`\n${'='.repeat(60)}`);
  console.log(`[${new Date().toISOString()}] INICIANDO CICLO COMPLETO`);
  console.log(`${'='.repeat(60)}`);
  
  try {
    // 1. Executa processo de estoque
    console.log("\nPASSO 1: Executando processo de ESTOQUE...");
    const resultadoEstoque = await executarEstoque();
    console.log("ESTOQUE finalizado:", resultadoEstoque);
    
    // Pequena pausa entre os processos
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // 2. Executa coleta de dados
    console.log("\nPASSO 2: Executando coleta de DADOS...");
    const dadosColetados = await executarColetaDados();
    console.log("COLETA finalizada:", {
      totalProdutos: dadosColetados.totalProdutos,
      lucroTotal: dadosColetados.lucroTotal
    });
    
    console.log(`\n${'='.repeat(60)}`);
    console.log(`[${new Date().toISOString()}] CICLO COMPLETO FINALIZADO COM SUCESSO`);
    console.log(`${'='.repeat(60)}\n`);
    
    isRunning = false;
    return { success: true, estoque: resultadoEstoque, dados: dadosColetados };
    
  } catch (error) {
    console.error(`\nERRO no ciclo completo:`, error.message);
    isRunning = false;
    throw error;
  }
}

// ROTAS DA API
app.post('/api/full-cycle', async (req, res) => {
  console.log("\nRequisição manual para ciclo completo recebida");
  try {
    const resultado = await executarCicloCompleto();
    res.json({ success: true, ...resultado });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/stock', async (req, res) => {
  console.log("\nRequisição manual para estoque recebida");
  try {
    const resultado = await executarEstoque();
    res.json({ success: true, ...resultado });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/scrape', async (req, res) => {
  console.log("\nRequisição manual para coleta recebida");
  try {
    const dados = await executarColetaDados();
    res.json({ success: true, data: dados });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/status', (req, res) => {
  res.json({ 
    running: isRunning,
    lastCheck: new Date().toISOString()
  });
});

app.get('/api/test', (req, res) => {
  res.json({ success: true, message: "Servidor está rodando!" });
});

// CONFIGURAÇÃO DO CRON - Roda a cada hora (:02)
// Cron: 2 * * * * = Aos 2 minutos de cada hora
const cronJob = cron.schedule('2 * * * *', async () => {
  console.log(`\nCRON JOB DISPARADO - Executando ciclo programado da hora`);
  await executarCicloCompleto();
}, {
  scheduled: true,
  timezone: "America/Sao_Paulo"
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`\nServidor rodando em http://localhost:${PORT}`);
  console.log(`Dashboard disponível em http://localhost:${PORT}/index.html`);
  console.log(`\nCRON configurado para executar aos 2 minutos de cada hora (Horário SP)`);
  console.log(`Sequência: ESTOQUE → COLETA DE DADOS`);
  console.log(`\nEndpoints disponíveis:`);
  console.log(`   POST /api/full-cycle - Executar ciclo completo manual`);
  console.log(`   POST /api/stock - Executar apenas estoque`);
  console.log(`   POST /api/scrape - Executar apenas coleta`);
  console.log(`   GET  /api/status - Verificar status`);
  console.log(`\nSistema pronto para deploy no Koyeb!\n`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('Recebido SIGTERM, encerrando...');
  cronJob.stop();
  process.exit(0);
});