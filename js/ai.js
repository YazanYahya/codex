const AI_ENDPOINT = "ADD_YOUR_AI_SERVICE_URL_HERE";
const AI_API_KEY = "ADD_YOUR_AI_API_KEY_HERE";
const AI_MODEL = "ADD_YOUR_AI_MODEL_NAME_HERE";

/**
 * Base AI function to call your model.
 * @param {string} question - The user's question or request.
 * @param {string} [codeContext=""] - Optional code snippet or entire source code for more context.
 * @returns {Promise<string>} AI's raw HTML response.
 */
export async function callAiApi(question, codeContext = "") {
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
                    {
                        "role": "system",
                        "content": "You are an AI code assistant designed to help with code editing, debugging, and explaining programming concepts."
                    },
                    {
                        role: "user",
                        content: `${question}\n\nFull Source Code:\n${codeContext}`
                    }
                ]
            })
        });

        if (!response.ok) {
            throw new Error(`AI request failed with status: ${response.status}`);
        }

        const data = await response.json();
        // Retrieve the AI response (assumed to be in Markdown format)
        const markdownResponse = data?.choices?.[0]?.message?.content || "No response from AI.";

        // Convert the Markdown to HTML using marked
        const htmlResponse = marked.parse(markdownResponse);

        return htmlResponse;
    } catch (err) {
        console.error("[AI] Error:", err);
        throw err;
    }
}

/**
 * Ask the AI to suggest a fix for a compilation error.
 * @param {string} errorOutput - The text of the compilation error.
 * @param {string} [codeContext=""] - Your entire source code for context if needed.
 * @returns {Promise<string>} The AI's suggested fix (HTML).
 */
export async function getFixSuggestion(errorOutput, codeContext = "") {
    const prompt = `Suggest a fix for this compiler error:\n${errorOutput}`;
    return callAiApi(prompt, codeContext);
}

/**
 * Ask the AI specifically about a selected snippet from the editor, with a user prompt.
 * @param {string} selectedCode - The snippet the user highlighted.
 * @param {string} userPrompt   - The question or instructions from the user.
 * @param {string} [fullSource=""] - The entire source code for additional context if needed.
 * @returns {Promise<string>} The AI's HTML response.
 */
export async function askAiAboutSelectedCode(selectedCode, userPrompt, fullSource = "") {
    const combinedPrompt = `${userPrompt}\n\nSelected code:\n${selectedCode}`;
    return callAiApi(combinedPrompt, fullSource);
}

/**
 * Appends a chat message (either user or AI) to the assistant's .chat-messages container.
 * @param {string} content - The HTML content for the message bubble.
 * @param {boolean} [isUser=false] - Pass true if it's a user message, false for AI.
 */
export function addAssistantMessage(content, isUser = false) {
    const chatContainer = document.querySelector(".chat-messages");
    if (!chatContainer) return;

    const timestamp = isUser
        ? ""
        : `<div class="message-timestamp">${new Date().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
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
 * Creates a small floating widget in the source editor that allows
 * the user to highlight code, type a question, and ask the AI about it.
 * @param {object} sourceEditor - The Monaco editor instance for the source code.
 */
export function createSelectionChatWidget(sourceEditor) {
    const ChatSelectionWidget = {
        domNode: null,
        getId: () => "ChatSelectionWidget",
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

                // Input for user question
                const inputArea = document.createElement("textarea");
                inputArea.placeholder = "Enter your question...";
                inputArea.rows = 2;
                Object.assign(inputArea.style, {
                    width: "100%",
                    border: "1px solid #1E88E5",
                    borderRadius: "6px",
                    padding: "5px",
                    marginBottom: "8px",
                    fontFamily: "Arial, sans-serif",
                    fontSize: "14px"
                });

                // "Ask AI" button
                const askButton = document.createElement("button");
                askButton.textContent = "Ask AI";
                Object.assign(askButton.style, {
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
                askButton.onmouseover = () => (askButton.style.backgroundColor = "#00695C");
                askButton.onmouseout = () => (askButton.style.backgroundColor = "#00897B");

                askButton.onclick = async () => {
                    const selectedText = sourceEditor
                        .getModel()
                        .getValueInRange(sourceEditor.getSelection());
                    const userQuestion = inputArea.value.trim();

                    if (!selectedText || !userQuestion) return;

                    // Show user’s question in chat
                    addAssistantMessage(
                        `<p>${userQuestion}</p><pre><code>${selectedText}</code></pre>`,
                        true
                    );
                    addAssistantMessage("<p>Processing your request...</p>", false);

                    try {
                        const response = await askAiAboutSelectedCode(
                            selectedText,
                            userQuestion,
                            sourceEditor.getValue()
                        );
                        // Replace the last message with AI's final response
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
                        inputArea.value = "";
                    }
                };

                this.domNode.appendChild(inputArea);
                this.domNode.appendChild(askButton);
            }
            return this.domNode;
        },
        getPosition: function () {
            const selection = sourceEditor.getSelection();
            if (selection && !selection.isEmpty()) {
                return {
                    position: selection.getEndPosition(),
                    preference: [monaco.editor.ContentWidgetPositionPreference.EXACT]
                };
            }
            return null;
        }
    };

    sourceEditor.addContentWidget(ChatSelectionWidget);

    sourceEditor.onDidChangeCursorSelection(() => {
        const selectedText = sourceEditor
            .getModel()
            .getValueInRange(sourceEditor.getSelection());

        if (selectedText.trim()) {
            sourceEditor.layoutContentWidget(ChatSelectionWidget);
            ChatSelectionWidget.domNode.style.display = "block";
        } else {
            ChatSelectionWidget.domNode.style.display = "none";
        }
    });
}

/**
 * Initializes the AI Assistant Panel in, for example, a GoldenLayout container.
 * @param {object} container - The layout container where the assistant panel is rendered.
 * @param {object} sourceEditor - The main Monaco editor instance (for context).
 * @param {Function} getCompilationError - A function returning the current compilation error message (if any).
 */
export function initAssistantPanel(container, sourceEditor, getCompilationError) {
    // The HTML for the AI panel (could also come from a separate .html file).
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
            placeholder="Ask me anything about code... (Shift+Enter for new line)"
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

    // Insert the panel HTML
    container.getElement().html(panelHtml);

    // Grab DOM references
    const $panel = container.getElement();
    const $messages = $panel.find(".chat-messages");
    const $input = $panel.find(".message-input");
    const $sendBtn = $panel.find(".send-button");
    const $fixBtn = $panel.find(".suggest-fix-button");
    const $indicator = $panel.find(".status-indicator");

    // Toggle loading
    function setLoadingState(isLoading) {
        $indicator.toggleClass("active", isLoading);
        $sendBtn.prop("disabled", isLoading);
        $fixBtn.prop("disabled", isLoading);
    }

    // Replace last bubble content
    function replaceLastBubble(newHTML) {
        $messages.find(".message:last .message-bubble").html(newHTML);
    }

    // On "Send"
    async function handleSend() {
        const userQuestion = $input.val().trim();
        if (!userQuestion) return;

        addAssistantMessage(userQuestion, true);
        $input.val("");

        setLoadingState(true);
        addAssistantMessage("<p>Processing your request...</p>", false);

        try {
            const codeCtx = sourceEditor.getValue();
            const aiResponse = await callAiApi(userQuestion, codeCtx);
            replaceLastBubble(aiResponse);
        } catch (err) {
            replaceLastBubble(`<div class="error-message">⚠️ Error: ${err.message}</div>`);
        } finally {
            setLoadingState(false);
        }
    }

    // On "Suggest Fix"
    async function handleSuggestFix() {
        const errorText = getCompilationError();
        if (!errorText) return;

        setLoadingState(true);
        addAssistantMessage("<p>Analyzing the error and suggesting fixes...</p>", false);

        try {
            const codeCtx = sourceEditor.getValue();
            const fix = await getFixSuggestion(errorText, codeCtx);

            addAssistantMessage(`
        <p>Compilation Error:</p>
        <pre><code>${errorText}</code></pre>
        <p><strong>AI Suggestion:</strong></p>
        ${fix}
      `);
        } catch (err) {
            addAssistantMessage(
                `<div class="error-message"><strong>Failed to fetch fix suggestion:</strong> ${err.message}</div>`
            );
        } finally {
            setLoadingState(false);
        }
    }

    // Events
    $sendBtn.on("click", handleSend);
    $fixBtn.on("click", handleSuggestFix);

    // Enter => send, Shift+Enter => new line
    $input.on("keypress", (e) => {
        if (e.which === 13 && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    });

    // Auto-resize
    $input.on("input", function () {
        this.style.height = "auto";
        this.style.height = this.scrollHeight + "px";
    });
}

/**
 * Toggle the visibility of the "Suggest Fix" button (if there's a compiler error).
 * @param {boolean} show - Pass true to show, false to hide.
 */
export function toggleSuggestFixButton(show) {
    const fixBtn = document.querySelector(".suggest-fix-button");
    if (!fixBtn) return;
    fixBtn.style.display = show ? "inline-block" : "none";
}