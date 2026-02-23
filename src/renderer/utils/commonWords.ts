/**
 * ~1000 most common English words sorted by frequency (most common first).
 * Based on corpus frequency data. Used to filter noise words from branch names.
 */
export const COMMON_WORDS: string[] = [
  // Top function words & pronouns
  'the', 'of', 'and', 'to', 'a', 'in', 'is', 'it', 'you', 'that',
  'he', 'was', 'for', 'on', 'are', 'with', 'as', 'i', 'his', 'they',
  'be', 'at', 'one', 'have', 'this', 'from', 'or', 'had', 'by', 'but',
  'not', 'what', 'all', 'were', 'we', 'when', 'your', 'can', 'said', 'there',
  'each', 'which', 'she', 'do', 'how', 'their', 'if', 'will', 'up', 'other',
  'about', 'out', 'many', 'then', 'them', 'these', 'so', 'some', 'her', 'would',
  'make', 'like', 'him', 'into', 'has', 'two', 'more', 'very', 'after', 'no',
  'just', 'its', 'also', 'could', 'our', 'than', 'been', 'now', 'my', 'made',
  'did', 'get', 'much', 'before', 'being', 'well', 'back', 'only', 'me', 'those',
  'should', 'over', 'such', 'where', 'most', 'us', 'an', 'may', 'new', 'way',

  // Common contractions (after punctuation stripping)
  'cant', 'dont', 'wont', 'didnt', 'doesnt', 'isnt', 'wasnt', 'arent', 'wouldnt',
  'shouldnt', 'couldnt', 'havent', 'hasnt', 'hadnt',

  // Common verbs, nouns, adjectives
  'time', 'know', 'take', 'people', 'come', 'could', 'good', 'see', 'go', 'used',
  'day', 'had', 'use', 'find', 'give', 'first', 'long', 'down', 'look', 'think',
  'still', 'own', 'say', 'help', 'put', 'different', 'same', 'old', 'tell', 'does',
  'set', 'three', 'want', 'any', 'need', 'even', 'right', 'too', 'mean', 'small',
  'every', 'last', 'another', 'off', 'turn', 'end', 'why', 'ask', 'men', 'run',
  'try', 'us', 'again', 'move', 'here', 'thing', 'great', 'big', 'must', 'start',
  'part', 'under', 'read', 'hand', 'high', 'year', 'keep', 'place', 'around', 'show',
  'change', 'went', 'while', 'close', 'might', 'next', 'hard', 'open', 'begin', 'life',
  'always', 'got', 'both', 'between', 'work', 'few', 'never', 'call', 'world', 'going',
  'point', 'home', 'water', 'own', 'left', 'number', 'really', 'almost', 'let', 'thought',

  // More common words
  'night', 'head', 'side', 'without', 'children', 'city', 'until', 'name', 'along',
  'enough', 'story', 'house', 'saw', 'far', 'school', 'important', 'sea', 'young',
  'state', 'family', 'leave', 'group', 'body', 'seem', 'together', 'often', 'face',
  'form', 'sure', 'kind', 'room', 'already', 'follow', 'since', 'little', 'done',
  'stand', 'play', 'bring', 'became', 'several', 'light', 'stop', 'once', 'learn',
  'real', 'car', 'country', 'write', 'eat', 'second', 'grow', 'eye', 'miss',
  'door', 'full', 'power', 'early', 'large', 'less', 'idea', 'yet', 'hear',
  'question', 'during', 'feet', 'live', 'later', 'though', 'against', 'food', 'air',
  'took', 'best', 'land', 'half', 'cut', 'above', 'girl', 'sometimes', 'nothing',
  'money', 'hold', 'boy', 'mother', 'near', 'study', 'father', 'book', 'almost',

  // Words 300-400
  'bit', 'until', 'paper', 'white', 'often', 'black', 'true', 'list', 'might',
  'mark', 'plan', 'table', 'upon', 'voice', 'class', 'four', 'given', 'look',
  'build', 'talk', 'become', 'word', 'line', 'area', 'less', 'love', 'friend',
  'feel', 'fact', 'top', 'cover', 'town', 'cross', 'heart', 'least', 'lost',
  'past', 'since', 'watch', 'today', 'age', 'care', 'sound', 'meet', 'hope',
  'fine', 'quite', 'earth', 'front', 'rest', 'fall', 'late', 'low', 'war',
  'fire', 'behind', 'short', 'example', 'shall', 'among', 'river', 'five', 'mile',
  'road', 'able', 'free', 'strong', 'horse', 'speak', 'figure', 'clear', 'known',
  'order', 'ground', 'along', 'man', 'woman', 'answer', 'nothing', 'toward', 'happen',
  'pass', 'minutes', 'mind', 'street', 'wish', 'morning', 'course', 'picture', 'dark',

  // Words 400-500
  'across', 'field', 'stay', 'gone', 'deep', 'lay', 'ship', 'within', 'anything',
  'south', 'soon', 'natural', 'king', 'step', 'sun', 'perhaps', 'window', 'result',
  'return', 'possible', 'north', 'stood', 'cold', 'draw', 'carry', 'note', 'hundred',
  'west', 'piece', 'toward', 'gave', 'glass', 'told', 'lead', 'reach', 'level',
  'sent', 'dead', 'service', 'common', 'finally', 'drive', 'matter', 'fill', 'west',
  'east', 'force', 'blue', 'bring', 'view', 'green', 'rock', 'remember', 'able',
  'try', 'heavy', 'arm', 'believe', 'major', 'act', 'wife', 'size', 'tree',
  'baby', 'interest', 'wall', 'hair', 'bed', 'rather', 'sit', 'round', 'boat',
  'condition', 'week', 'sleep', 'foot', 'land', 'ball', 'test', 'record', 'future',
  'certain', 'rain', 'reason', 'decide', 'case', 'cost', 'value', 'summer', 'hot',

  // Words 500-600
  'month', 'listen', 'chance', 'letter', 'sat', 'usual', 'ready', 'simple', 'include',
  'oil', 'move', 'wonder', 'red', 'reach', 'consider', 'appear', 'space', 'piece',
  'whether', 'game', 'fall', 'wind', 'human', 'plant', 'knew', 'effect', 'matter',
  'wait', 'position', 'above', 'type', 'produce', 'dark', 'except', 'store', 'stand',
  'remain', 'fly', 'least', 'trouble', 'hour', 'song', 'measure', 'door', 'product',
  'south', 'sense', 'beauty', 'trade', 'deal', 'iron', 'million', 'rise', 'control',
  'born', 'late', 'break', 'animal', 'mountain', 'walk', 'press', 'general', 'unit',
  'direct', 'particular', 'special', 'difficult', 'period', 'color', 'single', 'office', 'mouth',
  'wrong', 'role', 'term', 'blood', 'miss', 'require', 'brother', 'lake', 'pain',
  'poor', 'material', 'kill', 'century', 'ten', 'leg', 'bright', 'sign', 'happen',

  // Words 600-700
  'center', 'edge', 'spoke', 'third', 'rise', 'garden', 'catch', 'cause', 'modern',
  'age', 'nor', 'pretty', 'serve', 'charge', 'law', 'problem', 'system', 'bank',
  'save', 'choose', 'dry', 'contain', 'smile', 'spring', 'north', 'captain', 'gold',
  'total', 'market', 'pick', 'fight', 'quick', 'eight', 'fight', 'straight', 'race',
  'create', 'whole', 'wear', 'sort', 'shape', 'wood', 'inch', 'rich', 'thick',
  'island', 'machine', 'hit', 'supply', 'drop', 'describe', 'sing', 'mass', 'safe',
  'please', 'wide', 'doctor', 'heat', 'cook', 'hill', 'act', 'region', 'model',
  'industry', 'bottom', 'key', 'board', 'subject', 'complete', 'push', 'energy', 'spot',
  'pattern', 'pay', 'village', 'floor', 'ring', 'crowd', 'train', 'afternoon', 'scene',
  'shop', 'brother', 'neck', 'pair', 'flat', 'camp', 'agree', 'sweet', 'silent',

  // Words 700-800
  'season', 'brown', 'exercise', 'finger', 'teeth', 'farm', 'trip', 'music', 'soft',
  'joy', 'fair', 'speech', 'bar', 'mile', 'lift', 'mix', 'ice', 'solve', 'dress',
  'sell', 'shoulder', 'thin', 'sky', 'river', 'seat', 'ear', 'stock', 'spend',
  'weight', 'lot', 'copy', 'collect', 'receive', 'sharp', 'dictionary', 'tire', 'crowd',
  'wire', 'choose', 'clean', 'column', 'suggest', 'surprise', 'favor', 'basic', 'nose',
  'wing', 'property', 'wave', 'silver', 'quiet', 'flat', 'skin', 'length', 'post',
  'expression', 'capital', 'milk', 'section', 'speed', 'bread', 'string', 'divide', 'master',
  'surprise', 'tool', 'paint', 'separate', 'truck', 'neighbor', 'current', 'lake', 'wheel',
  'forest', 'wash', 'ocean', 'cloud', 'gray', 'suit', 'bone', 'tube', 'crowd',
  'observe', 'locate', 'wild', 'glad', 'burn', 'captain', 'pound', 'prove', 'operate',

  // Words 800-900
  'electric', 'steel', 'string', 'lady', 'smell', 'double', 'seat', 'continue', 'block',
  'chart', 'hat', 'sell', 'success', 'company', 'event', 'particular', 'deal',
  'swim', 'band', 'arm', 'engine', 'soil', 'original', 'gentle', 'skill', 'ride',
  'track', 'branch', 'guess', 'necessary', 'sharp', 'wing', 'struggle', 'throw', 'cheap',
  'tire', 'opposite', 'wrong', 'circle', 'surprise', 'ten', 'dictionary', 'fight', 'gift',
  'claim', 'desert', 'search', 'tie', 'condition', 'dream', 'evening', 'cry', 'feed',
  'raise', 'led', 'bite', 'wish', 'row', 'kick', 'fast', 'paragraph', 'favor',
  'object', 'explore', 'hunt', 'shell', 'string', 'flow', 'spread', 'gas', 'clock',
  'map', 'noise', 'stick', 'tiny', 'stream', 'fear', 'sign', 'empty', 'sand',
  'joy', 'mine', 'range', 'bat', 'team', 'pull', 'grain', 'cotton', 'roll',

  // Words 900-1000
  'dad', 'port', 'danger', 'cat', 'huge', 'coat', 'mass', 'card', 'band',
  'rope', 'slip', 'win', 'dream', 'sail', 'supply', 'drink', 'fit', 'develop',
  'lot', 'bare', 'seed', 'tone', 'join', 'suggest', 'clean', 'poem', 'industry',
  'flag', 'nor', 'depend', 'meat', 'rub', 'tube', 'famous', 'dollar', 'stream',
  'fear', 'sight', 'thin', 'noon', 'chest', 'eight', 'permit', 'broad', 'shoulder',
  'tide', 'clock', 'contain', 'bill', 'path', 'planet', 'village', 'log', 'spin',
  'spread', 'yard', 'support', 'corner', 'electric', 'fruit', 'tight', 'provide', 'agree',
  'thus', 'capital', 'chair', 'danger', 'fruit', 'rich', 'thick', 'soldier', 'process',
  'operate', 'practice', 'separate', 'original', 'difficult', 'doctor', 'please', 'protect', 'lunch',
  'property', 'guide', 'row', 'engine', 'truck', 'flower', 'whose', 'market', 'indicate',

  // Common gerunds and conjunctions
  'because', 'through', 'instead', 'using', 'having', 'doing', 'going',
  'getting', 'making', 'taking', 'coming',
]

export const COMMON_WORDS_SET = new Set(COMMON_WORDS)
