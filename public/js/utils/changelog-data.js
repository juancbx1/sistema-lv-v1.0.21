// /js/utils/changelog-data.js
//
// Fonte de verdade das notas de versão do Sistema LV.
// Cada entrada tem duas seções:
//   admin    → novidades para quem gerencia o sistema
//   dashboard → novidades para os funcionários (linguagem simples)
//
// Ao fazer um release (npm version patch/minor/major):
//   1. Adicione uma nova entrada no INÍCIO do array
//   2. Preencha admin e/ou dashboard conforme o que mudou
//   3. Deixe vazio [] se a versão não teve mudanças para aquela audiência

export const changelog = [
    {
        versao: '1.21.1',
        data: '01/05/2026',
        admin: [
            'Ambiente de staging configurado para testes seguros antes de ir à produção',
        ],
        dashboard: [
            // Vazio — esta atualização não afeta as funcionárias
        ],
    },
    
    {
        versao: '1.21.0',
        data: '01/05/2026',
        admin: [
            'Versionamento semântico implementado — versão agora aparece no menu e segue o padrão SemVer',
            'Tela de Acesso Negado redesenhada e corrigida (agora desloga corretamente)',
            'Usuário de teste criado para desenvolvimento da dashboard sem usar senha real',
            'Notas de versão disponíveis agora — clique na versão para ver o que mudou',
        ],
        dashboard: [
            'Versão do sistema agora aparece na tela',
            'Clique na versão para ver as novidades de cada atualização',
        ],
    },


    // Template para próximas versões:
    // {
    //     versao: 'X.Y.Z',
    //     data: 'DD/MM/AAAA',
    //     admin: [],
    //     dashboard: [],
    // },
];
