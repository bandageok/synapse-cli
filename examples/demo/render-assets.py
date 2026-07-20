from pathlib import Path
import os
import textwrap

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[2]
ASSETS = ROOT / "docs" / "assets"
TRANSCRIPT = ASSETS / "demo-transcript.txt"

BG = "#0f1211"
PANEL = "#171c1a"
MUTED = "#8c9993"
TEXT = "#edf3ef"
GREEN = "#4ade80"
CYAN = "#67e8f9"
CORAL = "#fb7185"
YELLOW = "#facc15"


def font_path(name: str) -> str:
    windows = Path(os.environ.get("WINDIR", "C:/Windows")) / "Fonts"
    candidates = {
        "mono": [windows / "CascadiaMono.ttf", Path("/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf")],
        "sans": [windows / "segoeui.ttf", Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf")],
        "bold": [windows / "segoeuib.ttf", Path("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf")],
    }
    for candidate in candidates[name]:
        if candidate.exists():
            return str(candidate)
    raise FileNotFoundError(f"No usable {name} font found")


def load_font(name: str, size: int):
    return ImageFont.truetype(font_path(name), size)


def draw_terminal(draw: ImageDraw.ImageDraw, box, lines, title="synapse demo"):
    x0, y0, x1, y1 = box
    draw.rounded_rectangle(box, radius=12, fill=PANEL, outline="#2b3531", width=2)
    draw.rectangle((x0, y0 + 42, x1, y0 + 44), fill="#25302c")
    for index, color in enumerate((CORAL, YELLOW, GREEN)):
        cx = x0 + 24 + index * 24
        draw.ellipse((cx - 6, y0 + 21 - 6, cx + 6, y0 + 21 + 6), fill=color)
    draw.text((x0 + 110, y0 + 11), title, font=load_font("mono", 18), fill=MUTED)

    mono = load_font("mono", 22)
    wrap_width = max(24, int((x1 - x0 - 56) / 13.5))
    y = y0 + 66
    for line in lines:
        wrapped = textwrap.wrap(
            line,
            width=wrap_width,
            replace_whitespace=False,
            drop_whitespace=False,
        ) or [""]
        for part in wrapped:
            color = TEXT
            if part.startswith("$"):
                color = CYAN
            elif "[PASS]" in part or "Result: ready" in part:
                color = GREEN
            elif "Project memory loaded" in part or "Use npm.cmd" in part:
                color = YELLOW
            draw.text((x0 + 28, y), part, font=mono, fill=color)
            y += 28
            if y > y1 - 32:
                return


def render_demo(lines):
    width, height = 1200, 680
    reveal_points = [4, 9, 15, 22, len(lines)]
    durations = [900, 1100, 1300, 1600, 2800]
    frames = []
    for point in reveal_points:
        image = Image.new("RGB", (width, height), BG)
        draw = ImageDraw.Draw(image)
        draw.text((54, 34), "SYNAPSE CLI", font=load_font("bold", 34), fill=TEXT)
        draw.text((54, 78), "Project memory survives a provider boundary", font=load_font("sans", 22), fill=MUTED)
        visible = lines[:point]
        if point == len(lines):
            visible = visible[-10:]
        elif len(visible) > 17:
            visible = visible[-17:]
        draw_terminal(draw, (48, 124, 1152, 642), visible)
        frames.append(image)
    frames[0].save(
        ASSETS / "demo.gif",
        save_all=True,
        append_images=frames[1:],
        duration=durations,
        loop=0,
        optimize=True,
    )


def render_social(lines):
    image = Image.new("RGB", (1280, 640), BG)
    draw = ImageDraw.Draw(image)

    nodes = [(74, 80, GREEN), (112, 52, CYAN), (150, 86, CORAL)]
    draw.line((74, 80, 112, 52, 150, 86), fill="#50615a", width=4)
    for x, y, color in nodes:
        draw.ellipse((x - 10, y - 10, x + 10, y + 10), fill=color)

    draw.text((64, 132), "SYNAPSE", font=load_font("bold", 68), fill=TEXT)
    draw.text((67, 207), "CLI", font=load_font("mono", 32), fill=GREEN)
    draw.text((64, 286), "KEEP PROJECT MEMORY", font=load_font("bold", 30), fill=TEXT)
    draw.text((64, 326), "WHEN YOU SWITCH MODELS.", font=load_font("bold", 30), fill=TEXT)
    draw.text((66, 398), "Local-first coding agent", font=load_font("sans", 23), fill=MUTED)
    draw.text((66, 434), "Multi-provider | Fail-closed tools", font=load_font("sans", 23), fill=MUTED)
    draw.text((66, 536), "github.com/bandageok/synapse-cli", font=load_font("mono", 18), fill=CYAN)

    wanted = (
        "$ synapse provider set",
        "Active provider:",
        "Model:",
        "$ synapse doctor",
        "Result: ready",
        "$ echo",
        "Project memory loaded.",
    )
    compact = [line for line in lines if line.startswith(wanted)]
    draw_terminal(draw, (620, 68, 1230, 574), compact, title="real offline demo")
    image.save(ASSETS / "social-preview.png", optimize=True)


def main():
    if not TRANSCRIPT.exists():
        raise SystemExit("demo-transcript.txt is missing. Run node examples/demo/run-demo.mjs --record first.")
    ASSETS.mkdir(parents=True, exist_ok=True)
    lines = TRANSCRIPT.read_text(encoding="utf-8").splitlines()
    render_demo(lines)
    render_social(lines)
    print(f"Rendered {ASSETS / 'demo.gif'}")
    print(f"Rendered {ASSETS / 'social-preview.png'}")


if __name__ == "__main__":
    main()
