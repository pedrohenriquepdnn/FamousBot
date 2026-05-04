const { chromium } = require('playwright');
const readline = require('readline');

// Configurar interface para input do usuário
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Função para perguntar ao usuário
function perguntar(pergunta) {
  return new Promise((resolve) => {
    rl.question(pergunta, (resposta) => {
      resolve(resposta);
    });
  });
}

// Função para esperar
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Função para verificar o valor atual do multiplicador
async function verificarMultiplicadorAtual(page) {
  try {
    const valorElement = await page.locator('.irs-single');
    const valorTexto = await valorElement.textContent();
    return parseInt(valorTexto) || 0;
  } catch (error) {
    return 0;
  }
}

// Função para definir multiplicador para 1 usando setas
async function definirMultiplicadorPara1(page) {
  try {
    // Primeiro, clica no handle do slider para focar
    const handle = await page.locator('.irs-handle.single');
    await handle.click();
    await sleep(300);
    
    // Pega o valor atual
    let valorAtual = await verificarMultiplicadorAtual(page);
    console.log(`Valor atual: ${valorAtual}`);
    
    // Se já estiver no 1, não precisa fazer nada
    if (valorAtual === 1) {
      console.log(`Slider já está no valor 1`);
      return true;
    }
    
    // Se estiver em 0, pressiona seta direita 1 vez
    if (valorAtual === 0) {
      console.log(`Pressionando seta direita 1 vez para chegar ao 1...`);
      await page.keyboard.press('ArrowRight');
      await sleep(300);
    } 
    // Se estiver em outro valor (ex: 2, 3, etc), volta para 1
    else if (valorAtual > 1) {
      const diferenca = valorAtual - 1;
      console.log(`Pressionando seta esquerda ${diferenca} vez(es) para voltar ao 1...`);
      for (let i = 0; i < diferenca; i++) {
        await page.keyboard.press('ArrowLeft');
        await sleep(100);
      }
    }
    
    await sleep(500);
    
    // Verifica o valor final
    const valorFinal = await verificarMultiplicadorAtual(page);
    console.log(`Valor final: ${valorFinal}`);
    
    return valorFinal === 1;
    
  } catch (error) {
    console.error('Erro ao usar setas:', error.message);
    return false;
  }
}

// Função principal do bot de multiplicadores
async function botMultiplicadores() {
  const browser = await chromium.launch({
    headless: false,
    args: ['--start-maximized']
  });

  const page = await browser.newPage();
  console.log("Iniciando bot de Multiplicadores...");

  try {
    // ========== PARTE DE LOGIN ==========
    console.log("Acessando página de login...");
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
    
    // ========== PARTE DOS MULTIPLICADORES ==========
    console.log("\nAcessando página de promoção...");
    await page.goto('https://jogofamous.com/promote?p=multis', {
      timeout: 60000,
      waitUntil: 'networkidle'
    });
    
    await sleep(2000);
    
    // Aguardar o select carregar
    await page.waitForSelector('select[name="titulo"]', { timeout: 10000 });
    
    // Extrair opções de trabalho
    const opcoesTrabalho = await page.evaluate(() => {
      const select = document.querySelector('select[name="titulo"]');
      const options = Array.from(select.options);
      return options
        .filter(opt => opt.value !== '')
        .map(opt => ({
          value: opt.value,
          texto: opt.textContent.trim()
        }));
    });
    
    if (opcoesTrabalho.length === 0) {
      console.log("Nenhum trabalho disponível!");
      await browser.close();
      rl.close();
      return;
    }
    
    console.log("\nTrabalhos disponíveis:");
    opcoesTrabalho.forEach((trabalho, index) => {
      console.log(`${index + 1} - ${trabalho.texto}`);
    });
    
    const respostaTrabalho = await perguntar(`\nSelecione o trabalho (1-${opcoesTrabalho.length}): `);
    const trabalhoIndex = parseInt(respostaTrabalho) - 1;
    
    if (trabalhoIndex < 0 || trabalhoIndex >= opcoesTrabalho.length) {
      console.log("Opção inválida!");
      await browser.close();
      rl.close();
      return;
    }
    
    const trabalhoSelecionado = opcoesTrabalho[trabalhoIndex];
    console.log(`Trabalho selecionado: ${trabalhoSelecionado.texto}`);
    
    // Selecionar o trabalho
    await page.selectOption('select[name="titulo"]', trabalhoSelecionado.value);
    await sleep(2000);
    
    // Aguardar o slider carregar
    await page.waitForSelector('.irs-max', { timeout: 10000 });
    
    // Extrair máximo de multis disponível
    const maxMultisElement = await page.locator('.irs-max');
    const maxMultisTexto = await maxMultisElement.textContent();
    const maxMultis = parseInt(maxMultisTexto) || 0;
    
    console.log(`\nMultiplicadores disponíveis: ${maxMultis}`);
    
    if (maxMultis === 0) {
      console.log("Nenhum multiplicador disponível!");
      await browser.close();
      rl.close();
      return;
    }
    
    // Perguntar QUANTAS VEZES quer aplicar o multiplicador 1
    const respostaQuantidade = await perguntar(`Quantas vezes deseja aplicar o multiplicador? (1-${maxMultis}) `);
    let quantidade = parseInt(respostaQuantidade);
    
    if (isNaN(quantidade) || quantidade < 1 || quantidade > maxMultis) {
      console.log(`Quantidade inválida! Usando padrão: 1`);
      quantidade = 1;
    }
    
    console.log(`\nIniciando aplicação de ${quantidade} multiplicador(es)...`);
    
    let sucessos = 0;
    
    // Loop para aplicar o multiplicador 1 várias vezes
    for (let i = 1; i <= quantidade; i++) {
      console.log(`\n${'='.repeat(50)}`);
      console.log(`[${i}/${quantidade}] Aplicando multiplicador...`);
      
      // Sempre define o multiplicador para 1
      const sucesso = await definirMultiplicadorPara1(page);
      
      if (!sucesso) {
        console.log(`Falha ao definir multiplicador para 1`);
        continue;
      }
      
      // Aguarda um momento antes de clicar
      await sleep(500);
      
      // Clica no botão Divulgar
      console.log("Clicando em Divulgar...");
      await Promise.all([
        page.waitForNavigation({ timeout: 60000, waitUntil: 'networkidle' }).catch(e => console.log("⏱️ Navegação concluída")),
        page.click('input[type="submit"][name="guardarmult"]')
      ]);
      
      console.log(`Multiplicador ${i} aplicado com sucesso!`);
      sucessos++;
      
      // Se não for o último, volta para página de multis
      if (i < quantidade) {
        console.log("Voltando para página de multiplicadores...");
        await page.goto('https://jogofamous.com/promote?p=multis', {
          timeout: 60000,
          waitUntil: 'networkidle'
        });
        
        await sleep(1000);
        
        // Re-seleciona o trabalho
        console.log(`Re-selecionando trabalho: ${trabalhoSelecionado.texto}`);
        await page.selectOption('select[name="titulo"]', trabalhoSelecionado.value);
        await sleep(2000);
        
        // Aguarda o slider carregar novamente
        await page.waitForSelector('.irs-max', { timeout: 10000 });
      }
      
      // Mostra progresso
      const restantes = quantidade - i;
      if (restantes > 0) {
        console.log(`\nFaltam ${restantes} aplicação(ões)...`);
      }
    }
    
    console.log(`\n${'='.repeat(50)}`);
    console.log(`PROCESSO CONCLUÍDO!`);
    console.log(`${sucessos}/${quantidade} multiplicadores aplicados com sucesso!`);
    
  } catch (error) {
    console.error('Erro no bot:', error.message);
  } finally {
    await sleep(3000);
    await browser.close();
    rl.close();
    console.log("\nBot finalizado!");
  }
}

// Executar o bot
botMultiplicadores();