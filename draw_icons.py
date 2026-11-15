
from PIL import Image, ImageDraw

def draw_shield(size):
    # Create transparent image
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    # Scale coordinates from 24x24 viewbox to target size
    scale = size / 24.0
    
    # Emerald green #10b981
    emerald = (16, 185, 129, 255)
    # Off-white stroke #f8fafc
    off_white = (248, 250, 252, 255)
    
    # Points for the shield
    pts = [
        (12 * scale, 2 * scale),      # Top center
        (20 * scale, 5 * scale),      # Top right
        (20 * scale, 12 * scale),     # Curve start right
        (12 * scale, 22 * scale),     # Bottom point
        (4 * scale, 12 * scale),      # Curve start left
        (4 * scale, 5 * scale),       # Top left
    ]
    
    # Stroke width 3 in 24x24 grid
    stroke_width = max(1, int(2 * scale)) # 2 looks better at smaller scales
    
    # Draw the shield shape with fill and stroke
    draw.polygon(pts, fill=emerald, outline=off_white, width=stroke_width)
    
    return img

# Generate the standard sizes
sizes = [16, 32, 48, 128]
output_dir = "/Users/ohmannomma/Documents/chrome_extension/domain_blocker/icons"
import os
os.makedirs(output_dir, exist_ok=True)

for s in sizes:
    icon = draw_shield(s)
    icon.save(os.path.join(output_dir, f"icon{s}.png"))
    print(f"Generated icon{s}.png")
