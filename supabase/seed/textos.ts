// Textos para armar reseñas, preguntas, viñetas y descripciones del catálogo de ejemplo.
// Las reseñas se escriben en el idioma del comprador (la mayoría en español y portugués, algunas en inglés),
// como pasa en un marketplace de frontera. Todo es ficticio.
import type { Texto } from './categorias.ts'

type Idioma = 'es' | 'pt' | 'en'
type Banco = Record<Idioma, string[]>

export const NOMBRES: Record<'PY' | 'BR' | 'AR', string[]> = {
  PY: ['Mirta B.', 'Ramón G.', 'Liz A.', 'Diego F.', 'Sonia V.', 'Hugo R.', 'Celeste M.', 'Osvaldo P.', 'Nilda C.', 'Arami D.',
    'Fátima O.', 'Rodrigo S.', 'Gladys E.', 'Juan Carlos T.', 'Perla N.', 'Marcelo Q.', 'Tania I.', 'Blas L.', 'Natalia K.', 'Aníbal Z.'],
  BR: ['Rafael S.', 'Juliana M.', 'Thiago A.', 'Fernanda L.', 'Gustavo P.', 'Camila R.', 'Leandro C.', 'Patrícia D.', 'Bruno F.',
    'Aline T.', 'Marcos V.', 'Débora N.', 'Felipe O.', 'Larissa G.', 'Rogério B.'],
  AR: ['Martín L.', 'Florencia D.', 'Santiago R.', 'Lucía P.', 'Gonzalo M.', 'Carolina V.', 'Ezequiel B.', 'Valeria S.', 'Nahuel T.',
    'Romina A.'],
}

export const CIUDADES: Record<'PY' | 'BR' | 'AR', string[]> = {
  PY: ['Ciudad del Este', 'Hernandarias', 'Minga Guazú', 'Presidente Franco', 'Asunción', 'Encarnación', 'Santa Rita'],
  BR: ['Foz do Iguaçu', 'Cascavel', 'Medianeira', 'Santa Terezinha de Itaipu', 'Curitiba'],
  AR: ['Puerto Iguazú', 'Posadas', 'Eldorado', 'Wanda'],
}

/** Títulos y cuerpos por cantidad de estrellas. {ciudad} y {dias} se completan al generar. */
export const RESENAS: Record<5 | 4 | 3 | 2 | 1, { titulos: Banco; textos: Banco }> = {
  5: {
    titulos: {
      es: ['Excelente', 'Tal cual la foto', 'Muy buena compra', 'Lo recomiendo', 'Llegó rapidísimo', 'Mejor de lo que esperaba', 'Vale cada guaraní'],
      pt: ['Excelente', 'Igual à foto', 'Ótima compra', 'Recomendo', 'Chegou muito rápido', 'Superou as expectativas'],
      en: ['Excellent', 'Exactly as pictured', 'Great buy', 'Highly recommend'],
    },
    textos: {
      es: [
        'Llegó en {dias} días a {ciudad}, bien embalado y sin un rayón. Es exactamente lo de la foto.',
        'Lo compré con miedo por ser online, pero vino perfecto. El vendedor me avisó por WhatsApp cuando salió.',
        'Muy buena calidad para el precio. Ya es la segunda vez que le compro a esta tienda.',
        'Lo retiré en el local al otro día de pagar. Me lo probaron delante mío y anda impecable.',
        'Comparé con lo que costaba del otro lado del Puente y acá me salió mejor. Muy conforme.',
        'Se nota que es buen material. Las medidas son las que dice la ficha.',
        'Mi mamá está chocha con esto. Llegó antes de lo que decía.',
        'Atención de primera: pregunté una duda a la noche y me respondieron a la mañana temprano.',
      ],
      pt: [
        'Chegou em {dias} dias em {ciudad}, bem embalado e sem nenhum arranhão. Igualzinho à foto.',
        'Comprei com receio por ser de outro país, mas veio perfeito e com nota fiscal.',
        'Qualidade muito boa pelo preço. Já é a segunda vez que compro dessa loja.',
        'Comparei com o preço do lado paraguaio e aqui saiu melhor. Muito satisfeito.',
        'Atendimento excelente, responderam todas as minhas dúvidas pelo chat.',
        'Material de qualidade e as medidas batem com a descrição.',
      ],
      en: [
        'Arrived in {dias} days to {ciudad}, well packed. Exactly as described.',
        'Great quality for the price, and the seller answered my questions quickly.',
        'Bought it while visiting Iguazú and had it shipped home. No issues at all.',
      ],
    },
  },
  4: {
    titulos: {
      es: ['Muy bueno', 'Buen producto', 'Conforme', 'Cumple', 'Bien, con un detalle'],
      pt: ['Muito bom', 'Bom produto', 'Satisfeito', 'Cumpre o que promete'],
      en: ['Very good', 'Good product', 'Does the job'],
    },
    textos: {
      es: [
        'Buen producto. Le saco una estrella porque tardó un día más de lo que decía, pero avisaron.',
        'Cumple bien. El color es un poco más claro que en la foto.',
        'Anda bien y vino completo. La caja llegó un poco golpeada, el producto no.',
        'Buena relación precio y calidad. Las instrucciones podrían venir también en guaraní o al menos más claras.',
        'Conforme. Esperaba que fuera un poco más grande, pero las medidas estaban en la ficha.',
      ],
      pt: [
        'Bom produto. Tiro uma estrela porque atrasou um dia, mas avisaram.',
        'Cumpre bem. A cor é um pouco mais clara que na foto.',
        'Veio completo e funciona bem. A caixa chegou amassada, o produto não.',
        'Boa relação custo-benefício. O manual poderia ser mais claro.',
      ],
      en: ['Works well. Shipping took one extra day, but they kept me posted.', 'Good value. Slightly smaller than I imagined.'],
    },
  },
  3: {
    titulos: {
      es: ['Normal', 'Ni bien ni mal', 'Regular', 'Esperaba más'],
      pt: ['Mediano', 'Nem bom nem ruim', 'Esperava mais'],
      en: ['Okay', 'Average'],
    },
    textos: {
      es: [
        'Hace lo que tiene que hacer, pero las terminaciones son flojas.',
        'Tardó {dias} días y tuve que reclamar. El producto está bien.',
        'Es correcto para el precio, no esperen maravillas.',
        'El color no es igual a la foto. Lo uso igual porque me hacía falta.',
      ],
      pt: [
        'Faz o que precisa, mas o acabamento deixa a desejar.',
        'Demorou {dias} dias e precisei reclamar. O produto é ok.',
        'Correto pelo preço, sem grandes surpresas.',
      ],
      en: ['It does the job, but the finish is a bit rough.', 'Fine for the price, nothing special.'],
    },
  },
  2: {
    titulos: {
      es: ['No me convenció', 'Flojo', 'Podría ser mejor'],
      pt: ['Não gostei', 'Fraco'],
      en: ['Not great'],
    },
    textos: {
      es: [
        'Vino con un golpe. Me lo cambiaron, pero tuve que ir dos veces al local.',
        'La calidad no es la que muestra la foto. Para el precio esperaba otra cosa.',
        'Funciona, pero hace más ruido del que debería.',
      ],
      pt: ['Veio com um amassado. Trocaram, mas precisei ir duas vezes à loja.', 'A qualidade não é a da foto.'],
      en: ['Arrived dented. They replaced it, but it took two trips.'],
    },
  },
  1: {
    titulos: {
      es: ['Mala experiencia', 'No lo recomiendo'],
      pt: ['Experiência ruim', 'Não recomendo'],
      en: ['Bad experience'],
    },
    textos: {
      es: ['Me llegó otro modelo. Estoy esperando que me lo cambien.', 'Se rompió a la semana. Hice el reclamo de garantía.'],
      pt: ['Chegou outro modelo. Estou aguardando a troca.', 'Quebrou em uma semana. Acionei a garantia.'],
      en: ['Wrong model delivered. Waiting for an exchange.'],
    },
  },
}

/** Frases por rubro que se suman a las reseñas buenas, para que no suenen todas iguales. */
export const DETALLES: Record<string, Banco> = {
  celulares: {
    es: ['La batería me dura todo el día.', 'Vino liberado, le puse el chip y anduvo.', 'Las fotos de noche salen mejor de lo que esperaba.', 'Me lo entregaron configurado en español.'],
    pt: ['A bateria dura o dia todo.', 'Veio desbloqueado, coloquei o chip e funcionou.', 'As fotos à noite saem melhores do que eu esperava.'],
    en: ['Battery lasts all day.', 'Came unlocked, worked with my SIM right away.'],
  },
  informatica: {
    es: ['La uso para la facultad y anda rápida.', 'La pantalla tiene buen brillo.', 'Vino con el teclado en español, con la ñ.'],
    pt: ['Uso para a faculdade e é rápida.', 'A tela tem um bom brilho.'],
    en: ['Fast enough for college work.', 'Bright screen.'],
  },
  audio: {
    es: ['Se escucha fuerte y claro.', 'La batería dura lo que dice.', 'Los uso en la moto y no se caen.'],
    pt: ['O som é alto e limpo.', 'A bateria dura o que promete.'],
    en: ['Loud and clear.', 'Battery lasts as advertised.'],
  },
  perfumeria: {
    es: ['Es original, vino sellado.', 'Dura todo el día en la piel.', 'Me preguntaron qué perfume tenía puesto.'],
    pt: ['É original, veio lacrado.', 'Dura o dia todo na pele.'],
    en: ['Genuine and sealed.', 'Lasts all day.'],
  },
  relojeria: {
    es: ['Me achicaron la malla en el local sin cobrarme.', 'Se ve más caro de lo que es.', 'La hora se lee bien al sol.'],
    pt: ['Ajustaram a pulseira na loja sem cobrar.', 'Parece mais caro do que é.'],
    en: ['They resized the bracelet for free.', 'Looks more expensive than it is.'],
  },
  electronica: {
    es: ['El sonido es mejor de lo que pensaba.', 'Lo probé con la tele del living y anduvo a la primera.', 'Trae el enchufe de dos patas planas, como en Paraguay.'],
    pt: ['O som é melhor do que eu imaginava.', 'Funcionou de primeira.', 'Veio com adaptador de tomada.'],
    en: ['Worked on the first try.'],
  },
  electrodomesticos: {
    es: ['Hierve el agua para el mate en un rato.', 'Es 220 V, ojo si lo llevan a otro lado.', 'Consume menos de lo que pensaba.'],
    pt: ['É 220 V, atenção.', 'Gasta menos energia do que eu pensava.'],
    en: ['Make sure your outlet is 220 V.'],
  },
  cocina: {
    es: ['La uso todos los días para el cocido.', 'Lavable y no se mancha.', 'Quedó lindísima en la mesa.'],
    pt: ['Uso todos os dias.', 'Fácil de lavar.', 'Ficou linda na mesa.'],
    en: ['I use it every day.'],
  },
  muebles: {
    es: ['Lo trajeron armado y lo subieron hasta el segundo piso.', 'Es firme, no se mueve nada.', 'La madera tiene buen olor y buena terminación.'],
    pt: ['Entregaram montado.', 'É firme, não balança.', 'Madeira com ótimo acabamento.'],
    en: ['Sturdy and well finished.'],
  },
  decoracion: {
    es: ['Queda hermoso en la mesa del comedor.', 'Es para regalo y quedó perfecto.', 'Se nota que está hecho a mano.'],
    pt: ['Ficou lindo na sala.', 'Comprei para presente e amaram.'],
    en: ['Bought it as a gift and they loved it.'],
  },
  iluminacion: {
    es: ['Da una luz cálida muy linda para el patio.', 'Fácil de instalar, lo puse yo solo.'],
    pt: ['Luz quente muito bonita.', 'Fácil de instalar.'],
    en: ['Easy to install.'],
  },
  herramientas: {
    es: ['La uso en la obra todos los días y aguanta.', 'Buen agarre, no se resbala con la mano transpirada.'],
    pt: ['Uso na obra todo dia e aguenta.', 'Boa pegada.'],
    en: ['Holds up on the job site.'],
  },
  jardin: {
    es: ['Aguantó el sol de enero sin problema.', 'La planta llegó sana y bien regada.'],
    pt: ['Aguentou o sol forte sem problema.', 'A planta chegou saudável.'],
    en: ['Survived the summer sun.'],
  },
  supermercado: {
    es: ['Fresquito, llegó el mismo día.', 'Bien empaquetado, nada aplastado.'],
    pt: ['Fresquinho, chegou no mesmo dia.'],
    en: ['Fresh and delivered the same day.'],
  },
  limpieza: { es: ['Rinde un montón.', 'Buen olor, no es fuerte.'], pt: ['Rende muito.'], en: ['Lasts a long time.'] },
  deportes: { es: ['Lo usé en el río el fin de semana y anduvo bárbaro.'], pt: ['Usei no rio no fim de semana, ótimo.'], en: ['Used it at the river, great.'] },
  juegos: { es: ['A mis hijos les encantó.', 'Buen regalo de cumpleaños.'], pt: ['As crianças amaram.'], en: ['Kids love it.'] },
  libreria: { es: ['Justo para la lista del colegio.'], pt: ['Perfeito para a lista escolar.'], en: ['Perfect for school.'] },
  moda: { es: ['El talle es el de siempre.', 'Combina con todo.'], pt: ['Tamanho certinho.'], en: ['True to size.'] },
  auto: { es: ['Lo tengo en el baúl por las dudas.', 'Buen producto para el taller.'], pt: ['Deixo no porta-malas.'], en: ['Keeps in the trunk.'] },
}

/** Preguntas frecuentes por rubro con la respuesta del vendedor. */
export const PREGUNTAS: { rubros: string[] | '*'; q: Banco; r: Banco }[] = [
  {
    rubros: ['celulares'],
    q: { es: ['¿Está liberado para cualquier compañía?', '¿Trae cargador en la caja?', '¿La garantía vale en Brasil?'],
      pt: ['Está desbloqueado para qualquer operadora?', 'Vem com carregador?'], en: ['Is it unlocked?'] },
    r: { es: ['Sí, viene liberado de fábrica y anda con las tres compañías de Paraguay, Brasil y Argentina.',
      'Trae el cable USB-C; el cargador se vende aparte y te hacemos precio si lo llevás junto.',
      'La garantía la cubrimos nosotros en el local. Si estás en Foz, lo podés traer o mandarlo por la transportadora.'],
      pt: ['Sim, vem desbloqueado de fábrica e funciona com as operadoras do Brasil, do Paraguai e da Argentina.', 'Vem com o cabo USB-C; o carregador é vendido à parte.'],
      en: ['Yes, factory unlocked; works with carriers in Paraguay, Brazil and Argentina.'] },
  },
  {
    rubros: ['informatica'],
    q: { es: ['¿El teclado es en español?', '¿Viene con el sistema instalado?'], pt: ['O teclado é em português?', 'Vem com sistema instalado?'],
      en: ['Which keyboard layout?'] },
    r: { es: ['Sí, teclado en español latinoamericano, con la ñ.', 'Sí, la entregamos instalada y actualizada, lista para usar.'],
      pt: ['Temos com teclado ABNT2 sob encomenda; o padrão é em espanhol.', 'Sim, entregamos com sistema instalado e atualizado.'],
      en: ['Latin American Spanish layout; US layout on request.'] },
  },
  {
    rubros: ['perfumeria'],
    q: { es: ['¿Es original?', '¿Cuánto dura en la piel?', '¿Tienen el de 200 ml?'], pt: ['É original?', 'Quanto tempo dura na pele?'],
      en: ['Is it genuine?'] },
    r: { es: ['Sí, es original: viene sellado y con número de lote, y te damos la factura.', 'Entre 6 y 8 horas en la piel; en la ropa, más.',
      'Las medidas que tenemos son las que ves arriba de la ficha.'],
      pt: ['Sim, é original: vem lacrado e com número de lote.', 'Entre 6 e 8 horas na pele.'], en: ['Yes, sealed with batch number and invoice.'] },
  },
  {
    rubros: ['relojeria'],
    q: { es: ['¿Me achican la malla?', '¿Se puede usar para nadar?'], pt: ['Vocês ajustam a pulseira?', 'Pode nadar com ele?'], en: ['Can you resize the strap?'] },
    r: { es: ['Sí, la achicamos en el local sin costo, en cinco minutos.', 'Fijate en la ficha hasta cuántos metros es sumergible: desde 50 m sirve para nadar en la pileta.'],
      pt: ['Sim, ajustamos na loja sem custo.', 'Veja na ficha até quantos metros é à prova d\'água: a partir de 50 m dá para nadar.'],
      en: ['Yes, free resizing in store.'] },
  },
  {
    rubros: '*',
    q: { es: ['¿Hacen envíos a Foz?', '¿Tienen factura legal?', '¿Puedo retirar hoy en el local?', '¿Tiene garantía?'],
      pt: ['Vocês entregam em Foz?', 'Emitem nota fiscal?', 'Posso retirar hoje?'], en: ['Do you ship to Brazil?'] },
    r: { es: ['Sí, enviamos a Foz y a Puerto Iguazú. El plazo aparece al elegir tu región.', 'Sí, emitimos factura legal con tu RUC o cédula.',
      'Sí, si pagás antes de las 15 h lo podés retirar el mismo día.', 'Sí, la garantía está en la ficha y la cubrimos nosotros en el local.'],
      pt: ['Sim, entregamos em Foz e em Puerto Iguazú. O prazo aparece ao escolher sua região.', 'Sim, emitimos nota fiscal.',
        'Sim, pagando até as 15h você retira no mesmo dia.'],
      en: ['Yes, we ship to Brazil and Argentina. Delivery time shows when you pick your region.'] },
  },
  {
    rubros: ['electronica', 'electrodomesticos', 'herramientas', 'iluminacion'],
    q: { es: ['¿Es 220 V?', '¿Viene con el enchufe de acá?', '¿Trae manual en español?'], pt: ['É 220 V?', 'Vem com manual em português?'],
      en: ['Is it 220 V?'] },
    r: { es: ['Sí, es 220 V, como la red de Paraguay, Argentina y la mayor parte de Brasil.', 'Sí, viene con enchufe de dos patas planas; si lo necesitás, te damos el adaptador.',
      'Sí, el manual viene en español y portugués.'], pt: ['Sim, é 220 V.', 'Sim, o manual vem em português e espanhol.'],
      en: ['Yes, 220 V.'] },
  },
  {
    rubros: ['muebles', 'jardin', 'decoracion'],
    q: { es: ['¿Viene armado?', '¿Lo tienen en otro color?', '¿Cuánto pesa?'], pt: ['Vem montado?', 'Tem em outra cor?'], en: ['Does it come assembled?'] },
    r: { es: ['Lo entregamos armado en Ciudad del Este y alrededores. Para el resto del país va desarmado con instrucciones.',
      'Los colores disponibles son los que ves arriba de la ficha.', 'El peso está en las especificaciones, con el embalaje suma más o menos un 10 %.'],
      pt: ['Entregamos montado na região. Para outras cidades vai desmontado com instruções.', 'As cores disponíveis estão na página.'],
      en: ['Assembled delivery in the Ciudad del Este area; flat-packed elsewhere.'] },
  },
  {
    rubros: ['supermercado', 'limpieza'],
    q: { es: ['¿Hasta qué hora toman pedidos para hoy?', '¿Venden por bulto?'], pt: ['Até que horas para entregar hoje?'], en: ['Same-day cutoff?'] },
    r: { es: ['Pedidos hasta las 11 h salen en el día.', 'Sí, para comprar por bulto escribinos por el chat de la tienda.'],
      pt: ['Pedidos até as 11h saem no mesmo dia.'], en: ['Orders before 11 am ship the same day.'] },
  },
  {
    rubros: ['moda'],
    q: { es: ['¿Cómo es la tabla de talles?', '¿Puedo cambiar el talle?'], pt: ['Posso trocar o tamanho?'], en: ['Can I exchange the size?'] },
    r: { es: ['Talle argentino estándar. Si dudás, pedí uno más.', 'Sí, tenés 30 días para cambiarlo sin uso y con la etiqueta.'],
      pt: ['Sim, você tem 30 dias para trocar sem uso e com etiqueta.'], en: ['Yes, within 30 days, unused and with tags.'] },
  },
]

/** Viñetas generales por rubro (se suman a las que salen de los atributos). */
export const VINETAS: Record<string, Banco> = {
  celulares: { es: ['Liberado de fábrica, con garantía escrita en la tienda'], pt: ['Desbloqueado de fábrica, com garantia por escrito'], en: ['Factory unlocked, written store warranty'] },
  informatica: { es: ['Teclado en español, con la ñ'], pt: ['Teclado em espanhol (ABNT2 sob encomenda)'], en: ['Spanish keyboard layout'] },
  audio: { es: ['Se conecta en segundos con cualquier celular'], pt: ['Conecta em segundos com qualquer celular'], en: ['Pairs with any phone in seconds'] },
  perfumeria: { es: ['Original, sellado y con número de lote'], pt: ['Original, lacrado e com número de lote'], en: ['Genuine, sealed and batch-numbered'] },
  relojeria: { es: ['Ajuste de malla sin costo en la tienda'], pt: ['Ajuste de pulseira grátis na loja'], en: ['Free strap resizing in store'] },
  electronica: { es: ['Probado en nuestro taller antes de salir'], pt: ['Testado na nossa oficina antes do envio'], en: ['Tested in our workshop before shipping'] },
  electrodomesticos: { es: ['Listo para la red de 220 V de la región'], pt: ['Pronto para a rede de 220 V da região'], en: ['Ready for the region\'s 220 V grid'] },
  cocina: { es: ['Apto para lavar a mano'], pt: ['Pode lavar à mão'], en: ['Hand-wash safe'] },
  muebles: { es: ['Entrega armada en Ciudad del Este y alrededores'], pt: ['Entrega montada na região de Ciudad del Este'], en: ['Assembled delivery around Ciudad del Este'] },
  decoracion: { es: ['Embalaje reforzado para que llegue sano'], pt: ['Embalagem reforçada'], en: ['Reinforced packaging'] },
  iluminacion: { es: ['Fácil de instalar con las instrucciones incluidas'], pt: ['Fácil de instalar com as instruções incluídas'], en: ['Easy to install, instructions included'] },
  herramientas: { es: ['Pensada para uso diario en obra o taller'], pt: ['Para uso diário em obra ou oficina'], en: ['Built for daily use on site or in the shop'] },
  jardin: { es: ['Resiste el sol y la humedad de la frontera'], pt: ['Resiste ao sol e à umidade da região'], en: ['Handles the region\'s sun and humidity'] },
  supermercado: { es: ['Se entrega fresco el mismo día en la zona'], pt: ['Entregue fresco no mesmo dia na região'], en: ['Delivered fresh the same day locally'] },
  limpieza: { es: ['Rinde para todo el mes'], pt: ['Rende o mês todo'], en: ['Lasts the whole month'] },
  deportes: { es: ['Para el río, la cancha o el monte'], pt: ['Para o rio, o campo ou a trilha'], en: ['For the river, the pitch or the trail'] },
  juegos: { es: ['Ideal para regalar'], pt: ['Ideal para presentear'], en: ['Makes a great gift'] },
  libreria: { es: ['Sirve para la lista escolar'], pt: ['Serve para a lista escolar'], en: ['School-list friendly'] },
  moda: { es: ['Cambio de talle sin costo dentro de los 30 días'], pt: ['Troca de tamanho grátis em 30 dias'], en: ['Free size exchange within 30 days'] },
  auto: { es: ['Para tener en el baúl o en el taller'], pt: ['Para ter no porta-malas ou na oficina'], en: ['Keep it in the trunk or the shop'] },
}

export const CONDICION: Record<'nuevo' | 'reacondicionado' | 'usado', Texto> = {
  nuevo: { es: 'Nuevo, en su caja', pt: 'Novo, na caixa', en: 'New, in its box' },
  reacondicionado: { es: 'Reacondicionado: revisado, limpio y con garantía de la tienda', pt: 'Recondicionado: revisado, limpo e com garantia da loja', en: 'Refurbished: inspected, cleaned and covered by the store' },
  usado: { es: 'Usado, con marcas de uso que se ven en las fotos', pt: 'Usado, com marcas de uso visíveis nas fotos', en: 'Used, with wear visible in the photos' },
}

export const EN_CAJA: Record<string, Banco> = {
  celulares: { es: ['El equipo', 'Cable USB-C', 'Funda transparente', 'Pin para el chip'], pt: ['O aparelho', 'Cabo USB-C', 'Capa transparente', 'Pino para o chip'], en: ['The device', 'USB-C cable', 'Clear case', 'SIM tool'] },
  informatica: { es: ['El equipo', 'Fuente o cable', 'Guía rápida'], pt: ['O equipamento', 'Fonte ou cabo', 'Guia rápido'], en: ['The device', 'Power adapter or cable', 'Quick guide'] },
  audio: { es: ['El equipo', 'Cable de carga USB-C', 'Manual en español y portugués'], pt: ['O aparelho', 'Cabo de carga USB-C', 'Manual em português e espanhol'], en: ['The device', 'USB-C charging cable', 'Manual'] },
  perfumeria: { es: ['El producto en su caja sellada'], pt: ['O produto na caixa lacrada'], en: ['The product in its sealed box'] },
  relojeria: { es: ['El reloj', 'Estuche', 'Certificado de garantía'], pt: ['O relógio', 'Estojo', 'Certificado de garantia'], en: ['The watch', 'Case', 'Warranty card'] },
  electronica: { es: ['El equipo', 'Cable de alimentación', 'Manual en español y portugués'], pt: ['O aparelho', 'Cabo de energia', 'Manual em português e espanhol'], en: ['The device', 'Power cable', 'Spanish and Portuguese manual'] },
  electrodomesticos: { es: ['El equipo', 'Manual y certificado de garantía'], pt: ['O aparelho', 'Manual e certificado de garantia'], en: ['The appliance', 'Manual and warranty card'] },
  herramientas: { es: ['La herramienta', 'Manual de seguridad'], pt: ['A ferramenta', 'Manual de segurança'], en: ['The tool', 'Safety manual'] },
  iluminacion: { es: ['La lámpara', 'Tarugos y tornillos de instalación'], pt: ['A luminária', 'Buchas e parafusos'], en: ['The lamp', 'Mounting screws and anchors'] },
  muebles: { es: ['El mueble', 'Herrajes y llave Allen si viene desarmado'], pt: ['O móvel', 'Ferragens e chave Allen se vier desmontado'], en: ['The furniture', 'Hardware and Allen key if flat-packed'] },
}
