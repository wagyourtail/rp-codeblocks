import {ReactElement} from "react";
import {Injector, Logger, common, util, webpack} from "replugged";
const {React, hljs} = common;
import "./style.css"

declare const DiscordNative: {
  clipboard: {
    copy: (s: string) => void;
  }
}

interface CodeBlockContent {
  lang: string
  content: string
  type: "codeBlock"
  inQuote: boolean
}

class BetterCodeblocks {
  private inject = new Injector();
  private logger = Logger.plugin("RPCodeblocks");

  public async start(): Promise<void> {
    await this.patchCodeblocks();
  }

  private async patchCodeblocks(): Promise<void> {
    const parser = await webpack.waitForModule<{
      defaultRules: {
        codeBlock: {
          react: (content: CodeBlockContent, t: unknown, o: unknown) => unknown;
        }
      }
    }>(webpack.filters.byProps("parse", "parseTopic"));
    this.logger.log(parser);
    this.inject.after(parser.defaultRules.codeBlock, "react", ([content], res) => {
        this.injectCodeblock(content, res as {props: {children: ReactElement}});
    });
    this.forceUpdate();
  }

  private injectCodeblock(content: CodeBlockContent, res: {props: {children: ReactElement}}): void {
    const render = res?.props?.children?.props?.render;

    res.props.children.props.render = (props: unknown) => {
      const codeblock = render(props);
      const codeElement = codeblock.props;

      const {lang} = content;
      const lines = codeElement.dangerouslySetInnerHTML
          ? codeElement.dangerouslySetInnerHTML.__html
              // Ensure this no span on multiple lines
              .replace(
                  /<span class="(hljs-[a-z]+)">([^<]*)<\/span>/g,
                  (_: never, className: string, code: string) => code.split('\n').map(l => `<span class="${className}">${l}</span>`).join('\n')
              )
              .split('\n')
          : codeElement.children.split('\n');

      const isSanitized = Boolean(codeElement.dangerouslySetInnerHTML);
      delete codeElement.dangerouslySetInnerHTML;

      codeElement.children = this.renderCodeblock(lang, lines, isSanitized);

      return codeblock;
    };
  }

  private renderCodeblock(lang: string | null | undefined, lines: string[], dangerous: boolean): React.ReactElement {
    lang = lang != null ? (hljs.getLanguage(lang) as {name: string} | null)?.name : null;

    const i18n = webpack.getByProps("Messages");
    const i18nMessages = i18n?.Messages as {COPY: string};

    return React.createElement(React.Fragment, null,
        lang && React.createElement('div', { className: 'powercord-codeblock-lang' }, lang),
        React.createElement('table', { className: 'powercord-codeblock-table' },
            ...lines.map((line, i) => React.createElement('tr', null,
                React.createElement('td', null, i + 1),
                // eslint-disable-next-line @typescript-eslint/naming-convention
                React.createElement('td', lang && dangerous ? { dangerouslySetInnerHTML: { __html: line } } : { children: line })
            ))
        ),
        React.createElement('button', {
          className: 'powercord-codeblock-copy-btn',
          onClick: this.onClickHandler
        }, i18nMessages.COPY)
    );
  }

  private onClickHandler (e: Event): void {
    const i18n = webpack.getByProps("Messages");
    const i18nMessages = i18n?.Messages as {ACCOUNT_USERNAME_COPY_SUCCESS_1: string, COPY: string};
    const { target } = e as { target: HTMLElement | null };
    if (target == null) throw new Error("Target is null");
    if (target.classList.contains('copied')) {
      this.logger.log('Already copied');
      return;
    }

    target.innerText = i18nMessages.ACCOUNT_USERNAME_COPY_SUCCESS_1;
    target.classList.add('copied');

    setTimeout(() => {
      target.innerText = i18nMessages.COPY;
      target.classList.remove('copied');
    }, 1e3);

    const code = [ ...target.parentElement!.querySelectorAll('td:last-child') ].map(t => t.textContent).join('\n');
    DiscordNative.clipboard.copy(code);
  }

  private forceUpdate(): void {
    document.querySelectorAll('[id^="chat-messages-"] > div').forEach(e => (util.getReactInstance(e).memoizedProps as {onMouseMove: () => void}).onMouseMove());
  }

  public close(): void {
    this.inject.uninjectAll();
    this.forceUpdate();
  }
}

const plugin = new BetterCodeblocks();

export async function start(): Promise<void> {
  await plugin.start();
}

export function stop(): void {
    plugin.close();
}