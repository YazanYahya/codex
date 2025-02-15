const AI_ENDPOINT = "ADD_YOUR_AI_SERVICE_URL_HERE";
const AI_API_KEY = "ADD_YOUR_AI_API_KEY_HERE";
const AI_MODEL = "ADD_YOUR_AI_MODEL_NAME_HERE";
const completionCache = {};
const MAX_CONTEXT_LENGTH = 2000;

/**
 * Low-level function that calls the AI chat API.
 * @param {string} systemPrompt - Instruction to set AI behavior.
 * @param {string} userPrompt - The user's query and context.
 * @returns {Promise<string>} - The AI's response text.
 */
async function fetchChatCompletion(systemPrompt, userPrompt) {
    try {
        const response = await fetch(AI_ENDPOINT, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${AI_API_KEY}`
            },
            body: JSON.stringify({
                model: AI_MODEL,
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: userPrompt }
                ]
            })
        });

        if (!response.ok)
            throw new Error(`API Error: ${response.status} ${response.statusText}`);

        const data = await response.json();
        return data?.choices?.[0]?.message?.content || "No response from AI.";
    } catch (error) {
        console.error("[AI] API Request Failed:", error);
        throw error;
    }
}

/**
 * Fetches the code assistant's response.
 * @param {string} question - The user's question.
 * @param {string} codeContext - The full source code context.
 * @param {Function} getSelectedLanguage - Async function returning current language.
 * @returns {Promise<string>} - HTML formatted AI response.
 */
export async function fetchCodeAssistantResponse(
    question,
    codeContext,
    getSelectedLanguage
) {
    const language = await getSelectedLanguage();
    const systemPrompt = `You are an expert programming assistant. Provide concise and accurate answers to questions about code. When applicable, include code snippets and follow ${language.name}'s formatting conventions.`;
    const userPrompt = `Question: ${question}\n\nSource Code:\n${codeContext}`;

    // Get the markdown response from the AI
    const markdownResponse = await fetchChatCompletion(systemPrompt, userPrompt);

    // Convert the Markdown to HTML (using marked)
    return marked.parse(markdownResponse);
}

/**
 * Fetches a fix suggestion for a compiler error.
 * @param {string} errorOutput - The compiler error message.
 * @param {string} codeContext - The full source code.
 * @param {Function} getSelectedLanguage - Async function returning current language.
 * @returns {Promise<string>} - HTML formatted AI response.
 */
export async function fetchCompilationFixSuggestion(
    errorOutput,
    codeContext,
    getSelectedLanguage
) {
    const prompt = `Analyze the following compiler error and suggest a potential fix. Return only the code changes (with minimal explanation if necessary):\n${errorOutput}`;
    return fetchCodeAssistantResponse(prompt, codeContext, getSelectedLanguage);
}

/**
 * Queries the AI about a highlighted code snippet with an additional user prompt.
 * @param {string} selectedCode - The highlighted code snippet.
 * @param {string} userPrompt - The user's question.
 * @param {string} fullSource - The full source code.
 * @param {Function} getSelectedLanguage - Async function returning current language.
 * @returns {Promise<string>} - HTML formatted AI response.
 */
export async function queryHighlightedCode(
    selectedCode,
    userPrompt,
    fullSource = "",
    getSelectedLanguage
) {
    const combinedPrompt = `${userPrompt}\n\nHighlighted Code:\n${selectedCode}`;
    return fetchCodeAssistantResponse(combinedPrompt, fullSource, getSelectedLanguage);
}

/**
 * Appends a chat message (either from the user or the AI) to the chat container.
 * @param {string} content - The HTML content of the message.
 * @param {boolean} isUser - Whether the message is from the user.
 */
export function addChatMessage(content, isUser = false) {
    const chatContainer = document.querySelector(".chat-messages");
    if (!chatContainer) return;

    const timestamp = isUser
        ? ""
        : `<div class="message-timestamp">${new Date().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit"
        })}</div>`;

    const messageEl = document.createElement("div");
    messageEl.className = `message ${isUser ? "user" : "ai"}`;
    messageEl.innerHTML = `
    <div class="message-bubble">${content}</div>
    ${timestamp}
  `;
    chatContainer.appendChild(messageEl);
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

/**
 * Creates a floating widget within the source editor that lets the user select code,
 * type a question, and query the AI about that specific snippet.
 * @param {Object} sourceEditor - The editor instance.
 * @param {Function} getSelectedLanguage - Async function returning current language.
 */
export function createSelectionChatWidget(sourceEditor, getSelectedLanguage) {
    const SelectionChatWidget = {
        domNode: null,
        getId: () => "SelectionChatWidget",
        getDomNode: function () {
            if (!this.domNode) {
                this.domNode = document.createElement("div");
                this.domNode.className = "chat-selection-container";
                Object.assign(this.domNode.style, {
                    position: "absolute",
                    top: "15px",
                    left: "15px",
                    zIndex: "10",
                    backgroundColor: "#E3F2FD",
                    border: "2px solid #1E88E5",
                    padding: "8px",
                    borderRadius: "8px",
                    boxShadow: "0 4px 8px rgba(0,0,0,0.2)",
                    display: "none",
                    width: "340px"
                });

                // Input area for the user's question.
                const questionInput = document.createElement("textarea");
                questionInput.placeholder = "Enter your question...";
                questionInput.rows = 2;
                Object.assign(questionInput.style, {
                    width: "100%",
                    border: "1px solid #1E88E5",
                    borderRadius: "6px",
                    padding: "5px",
                    marginBottom: "8px",
                    fontFamily: "Arial, sans-serif",
                    fontSize: "14px"
                });

                // "Ask AI" button.
                const askAIButton = document.createElement("button");
                askAIButton.textContent = "Ask AI";
                Object.assign(askAIButton.style, {
                    width: "100%",
                    backgroundColor: "#00897B",
                    color: "white",
                    border: "none",
                    padding: "8px",
                    cursor: "pointer",
                    borderRadius: "6px",
                    fontWeight: "bold",
                    transition: "background 0.3s"
                });
                askAIButton.onmouseover = () =>
                    (askAIButton.style.backgroundColor = "#00695C");
                askAIButton.onmouseout = () =>
                    (askAIButton.style.backgroundColor = "#00897B");

                askAIButton.onclick = async () => {
                    const selectedText = sourceEditor
                        .getModel()
                        .getValueInRange(sourceEditor.getSelection());
                    const userQuestion = questionInput.value.trim();

                    if (!selectedText || !userQuestion) return;

                    // Show the user's question and the selected code.
                    addChatMessage(
                        `<p>${userQuestion}</p><pre><code>${selectedText}</code></pre>`,
                        true
                    );
                    addChatMessage("<p>Processing your request...</p>", false);

                    try {
                        const response = await queryHighlightedCode(
                            selectedText,
                            userQuestion,
                            sourceEditor.getValue(),
                            getSelectedLanguage
                        );
                        // Update the last message bubble with the AI's response.
                        const lastBubble = document.querySelector(
                            ".chat-messages .message:last-child .message-bubble"
                        );
                        if (lastBubble) lastBubble.innerHTML = response;
                    } catch (err) {
                        const lastBubble = document.querySelector(
                            ".chat-messages .message:last-child .message-bubble"
                        );
                        if (lastBubble) {
                            lastBubble.innerHTML = `<div class="error-message">⚠️ Error: ${err.message}</div>`;
                        }
                    } finally {
                        questionInput.value = "";
                    }
                };

                this.domNode.appendChild(questionInput);
                this.domNode.appendChild(askAIButton);
            }
            return this.domNode;
        },
        getPosition: function () {
            const selection = sourceEditor.getSelection();
            if (selection && !selection.isEmpty()) {
                return {
                    position: selection.getEndPosition(),
                    preference: [
                        monaco.editor.ContentWidgetPositionPreference.EXACT
                    ]
                };
            }
            return null;
        }
    };

    sourceEditor.addContentWidget(SelectionChatWidget);

    sourceEditor.onDidChangeCursorSelection(() => {
        const selectedText = sourceEditor
            .getModel()
            .getValueInRange(sourceEditor.getSelection());

        if (selectedText.trim()) {
            sourceEditor.layoutContentWidget(SelectionChatWidget);
            SelectionChatWidget.domNode.style.display = "block";
        } else {
            SelectionChatWidget.domNode.style.display = "none";
        }
    });
}

/**
 * Initializes the AI Assistant Panel (e.g., within a GoldenLayout container).
 * @param {Object} container - The layout container.
 * @param {Object} sourceEditor - The editor instance.
 * @param {Function} getSelectedLanguage - Async function returning current language.
 * @param {Function} getCompilationError - Function to retrieve current compilation error.
 */
export function initAssistantPanel(
    container,
    sourceEditor,
    getSelectedLanguage,
    getCompilationError
) {
    const panelHtml = `
    <div class="assistant-panel">
      <div class="chat-header">
        <div class="ai-avatar">🤖</div>
        <h3>Code Assistant</h3>
        <div class="status-indicator"></div>
      </div>
      <div class="chat-messages"></div>
      <div class="chat-input-container">
        <div class="input-wrapper">
          <textarea
            placeholder="Ask me anything about code... (Shift+Enter for a new line)"
            rows="1"
            class="message-input"
          ></textarea>
          <button class="send-button">Send</button>
          <button class="suggest-fix-button" style="display: none;">Suggest Fix</button>
        </div>
        <div class="input-hint">
          I can help explain code, debug issues, and suggest fixes for errors.
        </div>
      </div>
    </div>
  `;

    container.getElement().html(panelHtml);

    const $panel = container.getElement();
    const $messages = $panel.find(".chat-messages");
    const $input = $panel.find(".message-input");
    const $sendBtn = $panel.find(".send-button");
    const $fixBtn = $panel.find(".suggest-fix-button");
    const $indicator = $panel.find(".status-indicator");

    // Toggle the loading state.
    function setLoadingState(isLoading) {
        $indicator.toggleClass("active", isLoading);
        $sendBtn.prop("disabled", isLoading);
        $fixBtn.prop("disabled", isLoading);
    }

    // Replace the last message bubble's content.
    function replaceLastBubble(newHTML) {
        $messages.find(".message:last .message-bubble").html(newHTML);
    }

    // Handle "Send" button click.
    async function handleSend() {
        const userQuestion = $input.val().trim();
        if (!userQuestion) return;

        addChatMessage(userQuestion, true);
        $input.val("");

        setLoadingState(true);
        addChatMessage("<p>Processing your request...</p>", false);

        try {
            const codeCtx = sourceEditor.getValue();
            const aiResponse = await fetchCodeAssistantResponse(
                userQuestion,
                codeCtx,
                getSelectedLanguage
            );
            replaceLastBubble(aiResponse);
        } catch (err) {
            replaceLastBubble(
                `<div class="error-message">⚠️ Error: ${err.message}</div>`
            );
        } finally {
            setLoadingState(false);
        }
    }

    // Handle "Suggest Fix" button click.
    async function handleSuggestFix() {
        const errorText = getCompilationError();
        if (!errorText) return;

        setLoadingState(true);
        addChatMessage(
            "<p>Analyzing the error and suggesting fixes...</p>",
            false
        );

        try {
            const codeCtx = sourceEditor.getValue();
            const fix = await fetchCompilationFixSuggestion(
                errorText,
                codeCtx,
                getSelectedLanguage
            );
            addChatMessage(`
        <p>Compilation Error:</p>
        <pre><code>${errorText}</code></pre>
        <p><strong>AI Suggestion:</strong></p>
        ${fix}
      `);
        } catch (err) {
            addChatMessage(
                `<div class="error-message"><strong>Failed to fetch fix suggestion:</strong> ${err.message}</div>`
            );
        } finally {
            setLoadingState(false);
        }
    }

    // Event bindings.
    $sendBtn.on("click", handleSend);
    $fixBtn.on("click", handleSuggestFix);

    // Enter to send; Shift+Enter for a newline.
    $input.on("keypress", (e) => {
        if (e.which === 13 && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    });

    // Auto-resize the input field.
    $input.on("input", function () {
        this.style.height = "auto";
        this.style.height = this.scrollHeight + "px";
    });
}

/**
 * Toggles the visibility of the "Suggest Fix" button based on whether a compiler error exists.
 * @param {boolean} show - true to show the button; false to hide.
 */
export function toggleSuggestFixButton(show) {
    const fixBtn = document.querySelector(".suggest-fix-button");
    if (!fixBtn) return;
    fixBtn.style.display = show ? "inline-block" : "none";
}

/**
 * Registers an AI-powered auto-completion provider.
 * @param {Function} getCurrentLanguage - Async function returning the current language.
 */
export function registerAutoCompletionProvider(getCurrentLanguage) {
    monaco.languages.registerCompletionItemProvider(
        "*",
        {
            triggerCharacters: [".", "(", " ", ":", "{", "[", "="],
            provideCompletionItems: async (model, position) => {
                const language = await getCurrentLanguage();
                const wordInfo = model.getWordUntilPosition(position);
                const range = {
                    startLineNumber: position.lineNumber,
                    endLineNumber: position.lineNumber,
                    startColumn: wordInfo.startColumn,
                    endColumn: position.column
                };

                const textUntilPosition = model.getValueInRange({
                    startLineNumber: 1,
                    startColumn: 1,
                    endLineNumber: position.lineNumber,
                    endColumn: position.column
                });

                const truncatedContext = textUntilPosition.slice(-MAX_CONTEXT_LENGTH);

                if (completionCache[truncatedContext]) {
                    return {
                        suggestions: completionCache[truncatedContext].map((item) => ({
                            ...item,
                            range: range
                        }))
                    };
                }

                try {
                    const suggestions = await fetchAutoCompletionSuggestions(
                        truncatedContext,
                        language.name
                    );
                    const items = suggestions.map((suggestion) => ({
                        label: suggestion,
                        kind: monaco.languages.CompletionItemKind.Text,
                        insertText: suggestion,
                        documentation: "AI Suggestion",
                        range: range
                    }));
                    console.log("AI Suggestions", suggestions);
                    completionCache[truncatedContext] = items;
                    return { suggestions: items };
                } catch (error) {
                    console.error("LLM Completion Error:", error);
                    return { suggestions: [] };
                }
            }
        },
        1000
    );
}

const AUTOCOMPLETE_SYSTEM_PROMPT = (language) =>
    `You are a code completion assistant specialized in ${language}. Based on the provided context, return only the minimal code snippet needed to complete the current line. Do not include any explanations.`;

const AUTOCOMPLETE_USER_PROMPT = (context, language) =>
    `Given the following code context, provide up to 5 possible ${language} code completions. Return your suggestions as a JSON array of strings containing only code snippets.

Code Context:
\`\`\`${language}
${context}
\`\`\`
`;

/**
 * Fetches AI-powered code completions for the current context.
 * @param {string} codeContext - The code context.
 * @param {string} language - The programming language.
 * @returns {Promise<string[]>} - An array of code snippet suggestions.
 */
async function fetchAutoCompletionSuggestions(codeContext, language) {
    try {
        const rawResponse = await fetchChatCompletion(
            AUTOCOMPLETE_SYSTEM_PROMPT(language),
            AUTOCOMPLETE_USER_PROMPT(codeContext, language)
        );
        return parseCompletionResponse(rawResponse);
    } catch (error) {
        console.error("Autocomplete Error:", error);
        return [];
    }
}

/**
 * Attempts to parse the AI response into an array of code completions.
 * @param {string} rawText - The raw response text.
 * @returns {string[]} - An array of code suggestions.
 */
function parseCompletionResponse(rawText) {
    try {
        // Try to extract a JSON array.
        const jsonMatch = rawText.match(/\[.*?\]/s);
        if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            return parsed.filter((s) => typeof s === "string");
        }

        // Fallback: split by lines and clean up.
        return rawText
            .split("\n")
            .map((line) =>
                line.replace(/^[\s\-*>"']+|[\s\-*>"']+$/g, "").trim()
            )
            .filter((line) => line.length > 0)
            .slice(0, 5);
    } catch (err) {
        console.warn("Failed to parse completion response:", err);
        return [];
    }
}