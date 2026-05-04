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

var isRunning = false;

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
    console.log("Navegou para: " + urlDestino);
  }
}

// FUNÇÃO: Abrir página de estoque (para o botão Estoque)
async function abrirPaginaEstoque() {
  if (isRunning) {
    console.log("Processo ja em execucao, ignorando...");
    return { success: false, message: "Ja esta rodando" };
  }
  
  isRunning = true;
  
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  console.log("Abrindo estoque...");

  try {
    await fazerLoginENavegar(page, 'https://jogofamous.com/projects?c=itens');
    
    console.log("Pagina de estoque aberta com sucesso!");
    
    await page.waitForTimeout(5000);
    
    await page.waitForSelector('tbody tr', { timeout: 60000 });
    
    console.log("Procurando itens sem estoque...");
    
    const linhas = page.locator('tbody tr:not(.footable-row-detail)');
    const total = await linhas.count();
    
    console.log("Total de linhas encontradas: " + total);
    
    function extrairNumero(texto) {
      return Number(texto.replace(/[^0-9]/g, '')) || 0;
    }
    
    let itensZero = 0;
    let itensAlterados = [];
    
    for (let i = 0; i < total; i++) {
      const linha = linhas.nth(i);
      const tds = linha.locator('td');
      
      const nomeTexto = await tds.nth(0).innerText();
      const estoqueTexto = await tds.nth(2).innerText();
      const precoTexto = await tds.nth(4).innerText();
      const estoque = extrairNumero(estoqueTexto);
      const precoNumerico = extrairNumero(precoTexto);
      
      if (estoque === 0) {
        itensZero++;
        console.log("SEM ESTOQUE: " + nomeTexto.trim() + " - " + precoTexto.trim());
        
        if (precoNumerico !== 1) {
          console.log("Alterando preco de " + precoTexto.trim() + " para $1");
          
          itensAlterados.push({
            nome: nomeTexto.trim(),
            precoOriginal: precoTexto.trim(),
            precoOriginalNumerico: precoNumerico
          });
          
          try {
            const botaoGerenciar = await linha.locator('button.btn-dark').first();
            await botaoGerenciar.hover();
            await page.waitForTimeout(500);
            await botaoGerenciar.click();
            await page.waitForTimeout(3000);
            
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
            
            const botaoOk = await page.locator('button.swal2-confirm');
            if (await botaoOk.count() > 0) {
              await botaoOk.first().click();
              await page.waitForTimeout(2000);
            }
            
            console.log("Preco alterado para $1 com sucesso!");
            
            await page.goto('https://jogofamous.com/projects?c=itens', {
              timeout: 60000,
              waitUntil: 'networkidle'
            });
            await page.waitForTimeout(3000);
            
          } catch (error) {
            console.error("Erro ao alterar preco: " + error.message);
            await page.keyboard.press('Escape').catch(() => {});
          }
        } else {
          console.log("Item ja esta com preco $1, pulando...");
        }
      }
    }
    
    console.log("Total de itens sem estoque: " + itensZero);
    
    if (itensZero > 0) {
      console.log("\n=== INICIANDO COMPRA DE ESTOQUE ===\n");
      
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
        console.error("Erro ao comprar estoque: " + error.message);
      }
    }
    
    if (itensAlterados.length > 0) {
      console.log("\n=== RESTAURANDO PRECOS ORIGINAIS ===\n");
      
      await page.goto('https://jogofamous.com/projects?c=itens', {
        timeout: 60000,
        waitUntil: 'networkidle'
      });
      await page.waitForTimeout(5000);
      
      const linhasRestauracao = page.locator('tbody tr:not(.footable-row-detail)');
      const totalRestauracao = await linhasRestauracao.count();
      
      for (let i = 0; i < totalRestauracao; i++) {
        const linha = linhasRestauracao.nth(i);
        const tds = linha.locator('td');
        
        const nomeTexto = await tds.nth(0).innerText();
        const nomeAtual = nomeTexto.trim();
        
        const itemAlterado = itensAlterados.find(item => item.nome === nomeAtual);
        
        if (itemAlterado) {
          console.log("Restaurando preco de " + nomeAtual + " para " + itemAlterado.precoOriginal);
          
          try {
            const botaoGerenciar = await linha.locator('button.btn-dark').first();
            await botaoGerenciar.hover();
            await page.waitForTimeout(500);
            await botaoGerenciar.click();
            await page.waitForTimeout(3000);
            
            await page.waitForSelector('a[href="#price-b2"]', { timeout: 10000 });
            const abaPreco = await page.locator('a[href="#price-b2"]').first();
            await abaPreco.click();
            await page.waitForTimeout(2000);
            
            await page.waitForSelector('input[name="valoritem"]', { timeout: 10000 });
            const campoPreco = await page.locator('input[name="valoritem"]').first();
            await campoPreco.click({ clickCount: 3 });
            await campoPreco.fill(itemAlterado.precoOriginalNumerico.toString());
            await page.waitForTimeout(1000);
            
            const botaoAlterar = await page.locator('input[name="guardarprice"]').first();
            await botaoAlterar.click();
            await page.waitForTimeout(3000);
            
            const botaoOk = await page.locator('button.swal2-confirm');
            if (await botaoOk.count() > 0) {
              await botaoOk.first().click();
              await page.waitForTimeout(2000);
            }
            
            console.log("Preco restaurado com sucesso!");
            
            await page.goto('https://jogofamous.com/projects?c=itens', {
              timeout: 60000,
              waitUntil: 'networkidle'
            });
            await page.waitForTimeout(3000);
            
          } catch (error) {
            console.error("Erro ao restaurar preco: " + error.message);
          }
        }
      }
      
      console.log("\n=== PRECOS RESTAURADOS COM SUCESSO ===\n");
    }
    
    console.log("\n=== PROCESSO COMPLETO FINALIZADO ===\n");
    await browser.close();
    isRunning = false;
    return { success: true, itensProcessados: itensZero };
    
  } catch (error) {
    console.error("Erro: " + error.message);
    await browser.close();
    isRunning = false;
    throw error;
  }
}

// FUNÇÃO: Bot original para coleta de dados
async function executarBotOriginal() {
  if (isRunning) {
    console.log("Processo ja em execucao, ignorando...");
    return null;
  }
  
  isRunning = true;
  
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  console.log("Carregando");

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
    
    await page.waitForSelector('tbody tr', { timeout: 60000 });
    const linhas = page.locator('tbody tr:not(.footable-row-detail)');
    const total = await linhas.count();

    console.log("TOTAL REAL: " + total);

    let lucroTotal = 0; 
    let lucroTotalEstimado = 0;
    const produtosArray = [];

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

        console.log("Produto: " + nome + " - Lucro: " + lucro);

      } catch (error) {
        console.error("Erro no item " + (i + 1) + ": " + error.message);
      }
    }
      
    console.log("Finalizou todos os itens!");
    console.log("LUCRO TOTAL: " + lucroTotal.toLocaleString());
    console.log("LUCRO TOTAL ESTIMADO SEMANA: " + Math.round(lucroTotalEstimado).toLocaleString());

    const diasRestantes = Math.floor(horasRestantes / 24);
    const horasRestantesFinal = Math.floor(horasRestantes % 24);
    const vendasTotal = produtosArray.reduce((sum, p) => sum + p.vendasSemana, 0);
    const vendasPorHoraMedia = vendasTotal / horasPassadas;
    const vendasPorDiaMedia = vendasPorHoraMedia * 24;

    console.log("LOJA RESETA EM: " + diasRestantes + "d " + horasRestantesFinal + "h");

    await browser.close();
    isRunning = false;

    return {
      produtos: produtosArray,
      lucroTotal: lucroTotal,
      lucroTotalEstimado: Math.round(lucroTotalEstimado),
      vendasPorHoraMedia: Math.round(vendasPorHoraMedia * 100) / 100,
      vendasPorDiaMedia: Math.round(vendasPorDiaMedia * 100) / 100,
      tempoReset: diasRestantes + "d " + horasRestantesFinal + "h",
      dataColeta: new Date().toISOString(),
      totalProdutos: produtosArray.length
    };

  } catch (error) {
    console.error("Erro: " + error.message);
    await browser.close();
    isRunning = false;
    throw error;
  }
}

// ROTA: Apenas estoque
app.post('/api/open-stock', async (req, res) => {
  console.log("\nAbrindo pagina de estoque...\n");
  try {
    const resultado = await abrirPaginaEstoque();
    res.json({ success: true, message: "Estoque processado com sucesso!", itensProcessados: resultado.itensProcessados });
  } catch (error) {
    console.error("Erro: " + error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ROTA: Apenas coleta de dados
app.post('/api/scrape', async (req, res) => {
  console.log("\nIniciando coleta de dados...\n");
  try {
    const dados = await executarBotOriginal();
    console.log("Coleta finalizada com sucesso!");
    res.json({ success: true, data: dados });
  } catch (error) {
    console.error("Erro na coleta: " + error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Rota de teste
app.get('/api/test', (req, res) => {
  res.json({ success: true, message: "Servidor esta rodando!" });
});

// Rota de status
app.get('/api/status', (req, res) => {
  res.json({ running: isRunning, lastCheck: new Date().toISOString() });
});

// Cron job: executa a cada hora no minuto 2 (13:02, 14:02, 15:02...)
cron.schedule('2 * * * *', async () => {
  console.log("\n=== EXECUTANDO CICLO PROGRAMADO (HORA: " + new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) + ") ===\n");
  console.log("1. Executando estoque...");
  await abrirPaginaEstoque();
  console.log("\n2. Executando coleta de dados...");
  await executarBotOriginal();
  console.log("\n=== CICLO PROGRAMADO FINALIZADO ===\n");
}, {
  scheduled: true,
  timezone: "America/Sao_Paulo"
});

app.listen(PORT, () => {
  console.log("\nServidor rodando em http://localhost:" + PORT);
  console.log("Dashboard disponivel em http://localhost:" + PORT + "/index.html");
  console.log("\n- Botao 'Atualizar Dados' -> Coleta dados em background");
  console.log("- Botao 'Estoque' -> Processa apenas estoque");
  console.log("- Cron: executa a cada hora no minuto 2 (13:02, 14:02, 15:02...)\n");
});