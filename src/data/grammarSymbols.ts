// Reference of the symbols/keywords defined in RelativizedCL.pest, grouped by
// purpose. Shared by AnalysisPage (symbol picker/inserter) and
// DocumentationPage (grammar reference section) so both stay in sync.
export interface GrammarSymbol {
  symbol: string;
  name: string;
  description: string;
  snippet: string;
}

export interface GrammarSymbolGroup {
  category: string;
  items: GrammarSymbol[];
}

export const GRAMMAR_SYMBOLS: GrammarSymbolGroup[] = [
  {
    category: "Contract Structure",
    items: [
      {
        symbol: "conflict { ... };",
        name: "Conflict declaration",
        description: "Declares which individuals (globally, and/or relative to each other) should be checked for normative conflicts.",
        snippet: "conflict {\n  global { (A,B) }\n  relativized { (A,B) }\n};",
      },
      {
        symbol: ";",
        name: "End of clause",
        description: "Terminates a clause or the conflict declaration. Every rule must end with it.",
        snippet: ";",
      },
    ],
  },
  {
    category: "Deontic Operators (Rules)",
    items: [
      {
        symbol: "{A,B}O(action);",
        name: "Obligation",
        description: "A is obliged, relative to B, to perform \"action\". Use {A} instead of {A,B} for a non-relativized (global) obligation.",
        snippet: "{A,B}O(action);",
      },
      {
        symbol: "{A,B}P(action);",
        name: "Permission",
        description: "A is permitted, relative to B, to perform \"action\".",
        snippet: "{A,B}P(action);",
      },
      {
        symbol: "{A,B}F(action);",
        name: "Prohibition",
        description: "A is forbidden, relative to B, from performing \"action\".",
        snippet: "{A,B}F(action);",
      },
      {
        symbol: "_/ clause /_",
        name: "Penalty",
        description: "Optional consequence attached to an obligation or prohibition: applies if it's violated. Written right after the O(...) or F(...) term.",
        snippet: "_/ clause /_",
      },
    ],
  },
  {
    category: "Dynamic Clause",
    items: [
      {
        symbol: "{A,B}[beta](clause);",
        name: "Dynamic update",
        description: "After the action sequence \"beta\" happens, \"clause\" becomes the new rule, relative to A and B.",
        snippet: "{A,B}[beta](clause);",
      },
    ],
  },
  {
    category: "Action Operators",
    items: [
      {
        symbol: "+",
        name: "Choice",
        description: "\"a+b\" means: do a, or do b.",
        snippet: "+",
      },
      {
        symbol: ".",
        name: "Sequence",
        description: "\"a.b\" means: do a, then do b.",
        snippet: ".",
      },
      {
        symbol: "&",
        name: "Concurrency",
        description: "\"a&b\" means: do a and b at the same time.",
        snippet: "&",
      },
      {
        symbol: "*",
        name: "Iteration",
        description: "Only valid inside a dynamic clause's [beta]. \"a*\" means: repeat action a zero or more times.",
        snippet: "*",
      },
      {
        symbol: "!",
        name: "Negation",
        description: "Only valid inside a dynamic clause's [beta]. \"!a\" means: any action other than a.",
        snippet: "!",
      },
      {
        symbol: "1",
        name: "Skip",
        description: "Represents an empty action (a no-op).",
        snippet: "1",
      },
      {
        symbol: "0",
        name: "Violation",
        description: "Represents a violating action.",
        snippet: "0",
      },
    ],
  },
  {
    category: "Clause Connectors & Literals",
    items: [
      {
        symbol: "^  (or AND)",
        name: "Conjunction",
        description: "Combines clause terms that must all hold at the same time.",
        snippet: "^",
      },
      {
        symbol: "|  (or OR)",
        name: "Disjunction",
        description: "Combines alternative prohibition terms.",
        snippet: "|",
      },
      {
        symbol: "-  (or XOR)",
        name: "Exclusive alternative",
        description: "Combines alternative obligation/permission terms — exactly one applies.",
        snippet: "-",
      },
      {
        symbol: "true",
        name: "True",
        description: "A clause term that always holds.",
        snippet: "true",
      },
      {
        symbol: "false",
        name: "False",
        description: "A clause term that never holds.",
        snippet: "false",
      },
    ],
  },
];
