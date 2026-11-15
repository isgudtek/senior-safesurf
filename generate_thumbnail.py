
import os
from PIL import Image, ImageDraw, ImageFont

def create_thumbnail():
    # Dimensions for a high-res promotional tile
    width, height = 1280, 800
    
    # Create background with a gradient
    # Deep blue theme: #0f172a to #1e293b
    base_color = (15, 23, 42)
    secondary_color = (30, 41, 59)
    
    img = Image.new('RGB', (width, height), base_color)
    draw = ImageDraw.Draw(img)
    
    # Simple radial-ish gradient simulation
    for i in range(height):
        ratio = i / height
        r = int(base_color[0] * (1 - ratio) + secondary_color[0] * ratio)
        g = int(base_color[1] * (1 - ratio) + secondary_color[1] * ratio)
        b = int(base_color[2] * (1 - ratio) + secondary_color[2] * ratio)
        draw.line([(0, i), (width, i)], fill=(r, g, b))

    # Add a subtle grid/pattern similar to the UI
    grid_spacing = 40
    for x in range(0, width, grid_spacing):
        for y in range(0, height, grid_spacing):
            draw.point((x, y), fill=(255, 255, 255, 10))

    try:
        # Load the shield icon
        # Use the high-res generated icon path (the 1024x1024 one)
        icon_path = "/Users/ohmannomma/.gemini/antigravity/brain/3ae9d655-9d5c-4488-bcab-ec5b636d00d5/blocker_shield_icon_1769661294398.png"
        if not os.path.exists(icon_path):
             # Fallback to the largest resized one if source is missing
             icon_path = "/Users/ohmannomma/Documents/chrome_extension/domain_blocker/icons/icon128.png"
             
        shield = Image.open(icon_path).convert("RGBA")
        
        # Resize shield for the thumbnail (e.g., 400x400)
        shield_size = 400
        shield = shield.resize((shield_size, shield_size), Image.Resampling.LANCZOS)
        
        # Center the shield
        offset = ((width - shield_size) // 2, (height - shield_size) // 2 - 50)
        img.paste(shield, offset, shield)
        
        # Add Text (Blocker.ai)
        # We'll try to use a system font
        font_path = "/System/Library/Fonts/Helvetica.ttc" # Standard Mac font
        if not os.path.exists(font_path):
            font_path = "/System/Library/Fonts/Supplemental/Arial.ttf"
            
        try:
            font_title = ImageFont.truetype(font_path, 100)
            font_subtitle = ImageFont.truetype(font_path, 40)
            
            # Draw Title
            title_text = "Senior SafeSurf"
            title_bbox = draw.textbbox((0, 0), title_text, font=font_title)
            title_w = title_bbox[2] - title_bbox[0]
            draw.text(((width - title_w) // 2, height - 200), title_text, font=font_title, fill=(16, 185, 129)) # Emerald Green
            
            # Draw Subtitle
            subtitle_text = "Surgical Domain & Path Blocking"
            subtitle_bbox = draw.textbbox((0, 0), subtitle_text, font=font_subtitle)
            subtitle_w = subtitle_bbox[2] - subtitle_bbox[0]
            draw.text(((width - subtitle_w) // 2, height - 100), subtitle_text, font=font_subtitle, fill=(148, 163, 184)) # Slate
            
        except Exception as e:
            print(f"Font error: {e}")
            
    except Exception as e:
        print(f"Icon error: {e}")

    output_path = "/Users/ohmannomma/Documents/chrome_extension/domain_blocker/store_thumbnail.png"
    img.save(output_path)
    print(f"Thumbnail saved to: {output_path}")

if __name__ == "__main__":
    create_thumbnail()
