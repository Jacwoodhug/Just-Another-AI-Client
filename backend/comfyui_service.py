"""ComfyUI image generation helper – plain module, not a FastAPI app."""

import json
import time
import uuid
from pathlib import Path
from typing import Any, Dict, Optional

import requests


def generate(
    prompt: str,
    negative_prompt: str,
    checkpoint: str,
    width: int,
    height: int,
    steps: int,
    cfg: float,
    sampler: str,
    scheduler: str,
    output_dir: Path,
    base_url: str,
    workflow_json: Optional[str] = None,
) -> str:
    """Build a workflow, submit it to ComfyUI, and return the saved image path."""

    seed = int(uuid.uuid4().int % (2**32))

    if workflow_json:
        # Use the custom workflow with placeholder substitution
        workflow: Dict[str, Any] = json.loads(workflow_json)
        for node in workflow.values():
            if not isinstance(node, dict):
                continue
            inputs = node.get("inputs", {})
            for key, val in inputs.items():
                if isinstance(val, str):
                    val = val.replace("__PROMPT__", prompt)
                    val = val.replace("__NEGATIVE_PROMPT__", negative_prompt or "")
                    inputs[key] = val
            # Randomize seed in KSampler / KSamplerAdvanced nodes
            class_type = node.get("class_type", "")
            if class_type in ("KSampler", "KSamplerAdvanced"):
                for seed_key in ("seed", "noise_seed"):
                    if seed_key in inputs:
                        inputs[seed_key] = seed
    else:
        workflow = {
            "4": {
                "class_type": "CheckpointLoaderSimple",
                "inputs": {"ckpt_name": checkpoint},
            },
            "6": {
                "class_type": "CLIPTextEncode",
                "inputs": {"text": prompt, "clip": ["4", 1]},
            },
            "7": {
                "class_type": "CLIPTextEncode",
                "inputs": {"text": negative_prompt or "", "clip": ["4", 1]},
            },
            "5": {
                "class_type": "EmptyLatentImage",
                "inputs": {"width": width, "height": height, "batch_size": 1},
            },
            "3": {
                "class_type": "KSampler",
                "inputs": {
                    "seed": seed,
                    "steps": steps,
                    "cfg": cfg,
                    "sampler_name": sampler,
                    "scheduler": scheduler,
                    "denoise": 1.0,
                    "model": ["4", 0],
                    "positive": ["6", 0],
                    "negative": ["7", 0],
                    "latent_image": ["5", 0],
                },
            },
            "8": {
                "class_type": "VAEDecode",
                "inputs": {"samples": ["3", 0], "vae": ["4", 2]},
            },
            "9": {
                "class_type": "SaveImage",
                "inputs": {"filename_prefix": "comfyui", "images": ["8", 0]},
            },
        }

    # Submit the prompt
    resp = requests.post(
        f"{base_url}/prompt",
        json={"prompt": workflow},
        timeout=30,
    )
    resp.raise_for_status()
    prompt_id = resp.json()["prompt_id"]

    # Poll history until the job completes (timeout 300s)
    deadline = time.time() + 300
    while time.time() < deadline:
        time.sleep(1)
        hist_resp = requests.get(
            f"{base_url}/history/{prompt_id}",
            timeout=10,
        )
        hist_resp.raise_for_status()
        history = hist_resp.json()
        if prompt_id in history:
            break
    else:
        raise TimeoutError(f"ComfyUI did not finish prompt {prompt_id} within 300s")

    # Extract the saved image info
    outputs = history[prompt_id]["outputs"]
    # Find the first output node that has an "images" key (works for any workflow)
    image_node = next(
        (node_out for node_out in outputs.values() if "images" in node_out),
        None,
    )
    if image_node is None:
        raise RuntimeError("ComfyUI returned no image output")
    image_info = image_node["images"][0]
    filename = image_info["filename"]
    subfolder = image_info.get("subfolder", "")
    img_type = image_info.get("type", "output")

    # Download the image
    view_resp = requests.get(
        f"{base_url}/view",
        params={"filename": filename, "subfolder": subfolder, "type": img_type},
        timeout=60,
    )
    view_resp.raise_for_status()

    output_dir.mkdir(parents=True, exist_ok=True)
    dest = output_dir / filename
    dest.write_bytes(view_resp.content)
    return str(dest.resolve())
