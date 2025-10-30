const REPO_URL = 'https://github.com/cconway1-stevens/budget';
const EMBED_SNIPPET = `<div class="github-widget-buttons">
  <iframe src="https://ghbtns.com/github-btn.html?user=cconway1-stevens&amp;repo=budget&amp;type=star&amp;count=true" width="120" height="20" title="GitHub Star"></iframe>
  <iframe src="https://ghbtns.com/github-btn.html?user=cconway1-stevens&amp;repo=budget&amp;type=fork&amp;count=true" width="120" height="20" title="GitHub Fork"></iframe>
  <iframe src="https://ghbtns.com/github-btn.html?user=cconway1-stevens&amp;type=follow&amp;count=true" width="200" height="20" title="Follow on GitHub"></iframe>
</div>`;

function copyToClipboard(text) {
  if (!text) return Promise.reject(new Error('Nothing to copy'));

  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(text);
  }

  return new Promise((resolve, reject) => {
    const temp = document.createElement('textarea');
    temp.value = text;
    temp.setAttribute('readonly', '');
    temp.style.position = 'absolute';
    temp.style.left = '-9999px';
    document.body.appendChild(temp);
    temp.select();

    try {
      const successful = document.execCommand('copy');
      document.body.removeChild(temp);
      if (successful) resolve();
      else reject(new Error('Copy command was rejected'));
    } catch (err) {
      document.body.removeChild(temp);
      reject(err);
    }
  });
}

function showStatus(message, isError = false) {
  const el = document.getElementById('shareStatus');
  if (!el) return;
  el.textContent = message;
  el.style.color = isError ? '#f87171' : '#38bdf8';
}

export function initShareWidget() {
  const repoInput = document.getElementById('repoUrlDisplay');
  const embedTextarea = document.getElementById('embedSnippet');
  const copyLinkBtn = document.getElementById('copyRepoLink');
  const copyEmbedBtn = document.getElementById('copyEmbedCode');

  if (repoInput) {
    repoInput.value = REPO_URL;
  }

  if (embedTextarea) {
    embedTextarea.value = EMBED_SNIPPET.trim();
  }

  if (copyLinkBtn) {
    copyLinkBtn.addEventListener('click', async () => {
      try {
        await copyToClipboard(REPO_URL);
        showStatus('Repository link copied to clipboard!');
      } catch (err) {
        console.error(err);
        showStatus('Unable to copy link. Try manually selecting the text.', true);
      }
    });
  }

  if (copyEmbedBtn) {
    copyEmbedBtn.addEventListener('click', async () => {
      try {
        await copyToClipboard(EMBED_SNIPPET);
        showStatus('Embed code copied. Paste it into any HTML page!');
      } catch (err) {
        console.error(err);
        showStatus('Unable to copy embed code. Try manually selecting the snippet.', true);
      }
    });
  }
}
